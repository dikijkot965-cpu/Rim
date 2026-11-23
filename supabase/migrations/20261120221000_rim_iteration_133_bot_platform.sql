create table if not exists public.rim_bots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  bot_user_id uuid not null unique references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  description text not null default '',
  token_hash text not null,
  is_active boolean not null default true,
  commands jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rim_bots_username_format check (username ~ '^[a-z][a-z0-9_]{3,30}bot$'),
  constraint rim_bots_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists public.rim_bot_updates (
  id bigint generated always as identity primary key,
  bot_id uuid not null references public.rim_bots(id) on delete cascade,
  update_type text not null default 'message',
  payload jsonb not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

create index if not exists idx_rim_bots_owner_created on public.rim_bots(owner_id,created_at desc);
create index if not exists idx_rim_bot_updates_poll on public.rim_bot_updates(bot_id,id) where consumed_at is null;

alter table public.rim_bots enable row level security;
alter table public.rim_bot_updates enable row level security;
revoke all on public.rim_bots from anon,authenticated;
grant select(id,owner_id,username,display_name,description,is_active,commands,created_at,updated_at) on public.rim_bots to authenticated;
create policy rim_bots_owner_read on public.rim_bots for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.rim_bot_updates from anon,authenticated;
grant all on public.rim_bots,public.rim_bot_updates to service_role;

create or replace function private.rim_capture_bot_message()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private
as $$
declare v_bot record; v_update_id bigint;
begin
  for v_bot in
    select b.id from public.rim_bots b
    join public.conversation_members cm on cm.user_id=b.bot_user_id and cm.conversation_id=new.conversation_id
    where b.is_active=true and b.bot_user_id<>new.sender_id
      and not exists(select 1 from public.rim_bots sender_bot where sender_bot.bot_user_id=new.sender_id)
  loop
    insert into public.rim_bot_updates(bot_id,update_type,payload)
    values(v_bot.id,'message',jsonb_build_object('message',jsonb_build_object(
      'message_id',new.id,'chat_id',new.conversation_id,'from_user_id',new.sender_id,
      'text',new.body,'date',new.created_at
    ))) returning id into v_update_id;
    update public.rim_bot_updates set payload=jsonb_set(payload,'{update_id}',to_jsonb(v_update_id),true)
      where id=v_update_id;
  end loop;
  return new;
end;
$$;
revoke all on function private.rim_capture_bot_message() from public,anon,authenticated;
drop trigger if exists rim_capture_bot_message on public.chat_messages;
create trigger rim_capture_bot_message after insert on public.chat_messages
for each row execute function private.rim_capture_bot_message();

-- Bot API calls are made only by the Edge Function using service_role.
create or replace function public.rim_bot_fetch_updates(p_bot_id uuid,p_offset bigint default 0,p_limit integer default 50)
returns setof public.rim_bot_updates language sql security definer
set search_path=pg_catalog,public
as $$
  select * from public.rim_bot_updates
  where bot_id=p_bot_id and id>=greatest(p_offset,1)
  order by id asc limit least(greatest(p_limit,1),100);
$$;
revoke all on function public.rim_bot_fetch_updates(uuid,bigint,integer) from public,anon,authenticated;
grant execute on function public.rim_bot_fetch_updates(uuid,bigint,integer) to service_role;

create or replace function public.rim_bot_ack_updates(p_bot_id uuid,p_through_id bigint)
returns integer language plpgsql security definer
set search_path=pg_catalog,public
as $$
declare v_count integer;
begin
  update public.rim_bot_updates set consumed_at=now()
  where bot_id=p_bot_id and id<=p_through_id and consumed_at is null;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
revoke all on function public.rim_bot_ack_updates(uuid,bigint) from public,anon,authenticated;
grant execute on function public.rim_bot_ack_updates(uuid,bigint) to service_role;

create or replace function public.rim_bot_send_message(p_bot_id uuid,p_chat_id uuid,p_text text)
returns uuid language plpgsql security definer
set search_path=pg_catalog,public
as $$
declare v_bot public.rim_bots%rowtype; v_message_id uuid;
begin
  select * into v_bot from public.rim_bots where id=p_bot_id and is_active=true;
  if not found then raise exception 'bot_not_active'; end if;
  if p_text is null or length(btrim(p_text))=0 or length(p_text)>4096 then raise exception 'invalid_message_text'; end if;
  if not exists(select 1 from public.conversation_members where conversation_id=p_chat_id and user_id=v_bot.bot_user_id) then
    raise exception 'bot_is_not_a_chat_member';
  end if;
  insert into public.chat_messages(conversation_id,sender_id,body,client_message_id)
    values(p_chat_id,v_bot.bot_user_id,p_text,'bot:'||p_bot_id::text||':'||gen_random_uuid()::text)
    returning id into v_message_id;
  update public.conversations set last_message_at=now() where id=p_chat_id;
  return v_message_id;
end;
$$;
revoke all on function public.rim_bot_send_message(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.rim_bot_send_message(uuid,uuid,text) to service_role;
