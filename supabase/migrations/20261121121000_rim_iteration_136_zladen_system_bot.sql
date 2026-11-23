-- Zladen system-bot identity and per-user chat installation.
-- The bot identity is provisioned by the rim-zladen Edge Function using Auth Admin.
-- This migration does not insert a fake row into auth.users.

create table if not exists public.rim_system_bot_registry (
  bot_key text primary key check (bot_key='zladen'),
  bot_user_id uuid unique references auth.users(id) on delete set null,
  owner_id uuid references auth.users(id) on delete set null,
  username text not null unique,
  display_name text not null,
  avatar_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.rim_system_bot_registry(bot_key,username,display_name)
values('zladen','zladen_bot','Злыдя') on conflict(bot_key) do nothing;

create table if not exists public.rim_system_bot_installs (
  user_id uuid not null references auth.users(id) on delete cascade,
  bot_key text not null references public.rim_system_bot_registry(bot_key) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  state text not null default 'active' check(state in ('active','blocked','unsubscribed')),
  installed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,bot_key)
);
create index if not exists rim_system_bot_installs_conversation_idx
  on public.rim_system_bot_installs(conversation_id) where conversation_id is not null;

alter table public.rim_system_bot_registry enable row level security;
alter table public.rim_system_bot_installs enable row level security;
revoke all on public.rim_system_bot_registry from anon,authenticated;
revoke all on public.rim_system_bot_installs from anon,authenticated;
grant select on public.rim_system_bot_installs to authenticated;
drop policy if exists rim_system_bot_install_owner_read on public.rim_system_bot_installs;
create policy rim_system_bot_install_owner_read on public.rim_system_bot_installs
for select to authenticated using(user_id=(select auth.uid()));

create or replace function public.rim_zladen_install_for_user(p_user_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth as $$
declare
  v_bot public.rim_system_bot_registry%rowtype;
  v_install public.rim_system_bot_installs%rowtype;
  v_conversation uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if p_user_id is null then raise exception 'user_required' using errcode='22023'; end if;
  if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'install_user_not_found' using errcode='P0002'; end if;
  select * into v_bot from public.rim_system_bot_registry where bot_key='zladen' and is_active=true;
  if not found or v_bot.bot_user_id is null then raise exception 'zladen_not_provisioned' using errcode='P0001'; end if;
  if p_user_id=v_bot.bot_user_id then raise exception 'invalid_install_user' using errcode='22023'; end if;

  select * into v_install from public.rim_system_bot_installs where user_id=p_user_id and bot_key='zladen';
  if found then
    if v_install.state <> 'active' then
      return jsonb_build_object('installed',false,'state',v_install.state,'conversation_id',v_install.conversation_id,'bot_user_id',v_bot.bot_user_id);
    end if;
    if v_install.conversation_id is not null and exists(select 1 from public.conversation_members where conversation_id=v_install.conversation_id and user_id=p_user_id) then
      return jsonb_build_object('installed',true,'state','active','conversation_id',v_install.conversation_id,'bot_user_id',v_bot.bot_user_id);
    end if;
  end if;

  insert into public.conversations(type,created_by,title,is_private)
  values('direct',p_user_id,v_bot.display_name,true)
  returning id into v_conversation;
  insert into public.conversation_members(conversation_id,user_id)
  values(v_conversation,p_user_id),(v_conversation,v_bot.bot_user_id)
  on conflict do nothing;
  insert into public.chat_messages(conversation_id,sender_id,body,client_message_id)
  values(v_conversation,v_bot.bot_user_id,'Привет! Я Злыдя — системный помощник РИМа. Пока мои команды находятся в разработке. Напиши /help, чтобы увидеть доступные команды.','zladen-welcome:'||p_user_id::text)
  on conflict(sender_id,client_message_id) do nothing;
  update public.conversations set last_message_at=now() where id=v_conversation;

  insert into public.rim_system_bot_installs(user_id,bot_key,conversation_id,state,installed_at,updated_at)
  values(p_user_id,'zladen',v_conversation,'active',now(),now())
  on conflict(user_id,bot_key) do update set conversation_id=excluded.conversation_id,state='active',updated_at=now();

  return jsonb_build_object('installed',true,'state','active','conversation_id',v_conversation,'bot_user_id',v_bot.bot_user_id,'username',v_bot.username,'display_name',v_bot.display_name);
end $$;
revoke all on function public.rim_zladen_install_for_user(uuid) from public,anon,authenticated;
grant execute on function public.rim_zladen_install_for_user(uuid) to service_role;

create or replace function public.rim_zladen_set_install_state(p_user_id uuid,p_state text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth as $$
declare v_install public.rim_system_bot_installs%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if p_user_id is null or p_state is null or p_state not in ('active','blocked','unsubscribed') then raise exception 'invalid_install_state' using errcode='22023'; end if;
  update public.rim_system_bot_installs set state=p_state,updated_at=now()
    where user_id=p_user_id and bot_key='zladen' returning * into v_install;
  if not found then raise exception 'zladen_install_not_found' using errcode='P0002'; end if;
  if p_state <> 'active' and v_install.conversation_id is not null then
    delete from public.conversation_members where conversation_id=v_install.conversation_id and user_id=p_user_id;
  end if;
  return jsonb_build_object('state',v_install.state,'conversation_id',v_install.conversation_id);
end $$;
revoke all on function public.rim_zladen_set_install_state(uuid,text) from public,anon,authenticated;
grant execute on function public.rim_zladen_set_install_state(uuid,text) to service_role;

-- Minimal first-party command responder. Rich Iris-style modules are a later milestone.
create or replace function private.rim_zladen_handle_message()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare
  v_bot public.rim_system_bot_registry%rowtype;
  v_command text;
  v_reply text;
begin
  if new.sender_id is null or coalesce(new.body,'')='' then return new; end if;
  select * into v_bot from public.rim_system_bot_registry where bot_key='zladen' and is_active=true;
  if not found or v_bot.bot_user_id is null or new.sender_id=v_bot.bot_user_id then return new; end if;
  if not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=v_bot.bot_user_id) then return new; end if;
  if exists(select 1 from public.rim_system_bot_installs where user_id=new.sender_id and bot_key='zladen' and state in ('blocked','unsubscribed')) then return new; end if;

  v_command := regexp_replace(lower(split_part(btrim(new.body),' ',1)),'@zladen_bot$','');
  if v_command in ('/start','/help','/commands') then
    v_reply := 'Я Злыдя — системный помощник РИМа. Сейчас доступны: /start, /help, /ping, /id. Остальные функции ещё разрабатываются.';
  elsif v_command='/ping' then
    v_reply := 'На связи. Злыдя работает.';
  elsif v_command='/id' then
    v_reply := 'ID этой переписки: '||new.conversation_id::text||E'\nТвой RIM ID: '||new.sender_id::text;
  else
    return new;
  end if;

  insert into public.chat_messages(conversation_id,sender_id,body,client_message_id)
  values(new.conversation_id,v_bot.bot_user_id,v_reply,'zladen-command:'||new.id::text)
  on conflict(sender_id,client_message_id) do nothing;
  update public.conversations set last_message_at=now() where id=new.conversation_id;
  return new;
end $$;
revoke all on function private.rim_zladen_handle_message() from public,anon,authenticated;
drop trigger if exists rim_zladen_handle_message on public.chat_messages;
create trigger rim_zladen_handle_message after insert on public.chat_messages
for each row execute function private.rim_zladen_handle_message();
