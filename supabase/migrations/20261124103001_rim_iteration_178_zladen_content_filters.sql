-- Iteration 178: configurable Zladen link and custom-word filters for ordinary groups.
create table if not exists public.rim_zladen_filter_settings (
 conversation_id uuid primary key references public.conversations(id) on delete cascade,
 links_enabled boolean not null default false, blocked_terms text[] not null default '{}',
 updated_by uuid, updated_at timestamptz not null default now(),
 constraint rim_zladen_filter_terms_bounded check(cardinality(blocked_terms)<=50)
);
alter table public.rim_zladen_filter_settings enable row level security;
revoke all on public.rim_zladen_filter_settings from public,anon,authenticated,service_role;
create or replace function private.rim_zladen_filter_content()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare v_group public.conversations%rowtype;v_settings public.rim_zladen_filter_settings%rowtype;v_bot_id uuid;v_term text;v_reason text;
begin
 if new.sender_id is null or coalesce(new.body,'')='' then return new;end if;
 select * into v_group from public.conversations where id=new.conversation_id;
 if not found or v_group.type<>'group' or coalesce(v_group.e2e_mode,'off') in ('pending','required') then return new;end if;
 select bot_user_id into v_bot_id from public.rim_system_bot_registry where bot_key='zladen' and is_active=true;
 if new.sender_id=v_bot_id then return new;end if;
 if v_group.created_by=new.sender_id or exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=new.sender_id and role in ('owner','admin')) then return new;end if;
 select * into v_settings from public.rim_zladen_filter_settings where conversation_id=new.conversation_id;
 if not found then return new;end if;
 if v_settings.links_enabled and new.body ~* '(https?://|www\\.|t\\.me/)' then v_reason:='link';
 else
  select term into v_term from unnest(coalesce(v_settings.blocked_terms,'{}'::text[])) as term where length(term) between 2 and 64 and position(lower(term) in lower(new.body))>0 order by length(term) desc limit 1;
  if v_term is not null then v_reason:='blocked_word';end if;
 end if;
 if v_reason is not null then
  insert into public.rim_zladen_audit(conversation_id,actor_id,action,details) values(new.conversation_id,new.sender_id,'content_filter_block',jsonb_build_object('reason',v_reason));
  return null;
 end if;
 return new;
end;
$$;
revoke all on function private.rim_zladen_filter_content() from public,anon,authenticated;
drop trigger if exists rim_zladen_content_filter_before_insert on public.chat_messages;
create trigger rim_zladen_content_filter_before_insert before insert on public.chat_messages for each row execute function private.rim_zladen_filter_content();
create or replace function private.rim_zladen_filter_commands()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare v_bot public.rim_system_bot_registry%rowtype;v_group public.conversations%rowtype;v_token text;v_rest text;v_action text;v_term text;v_rank integer:=0;v_reply text;v_settings public.rim_zladen_filter_settings%rowtype;
begin
 if new.sender_id is null or coalesce(new.body,'')='' then return new;end if;
 select * into v_bot from public.rim_system_bot_registry where bot_key='zladen' and is_active=true;
 if not found or v_bot.bot_user_id is null or new.sender_id=v_bot.bot_user_id then return new;end if;
 if not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=v_bot.bot_user_id) then return new;end if;
 select * into v_group from public.conversations where id=new.conversation_id;
 if not found or v_group.type<>'group' or coalesce(v_group.e2e_mode,'off') in ('pending','required') then return new;end if;
 v_token:=lower(split_part(btrim(new.body),' ',1));
 if regexp_replace(v_token,'^[/!.]','')<>'filter' or v_token !~ '^[/!.]' then return new;end if;
 v_rest:=btrim(substr(btrim(new.body),length(split_part(btrim(new.body),' ',1))+1));
 if v_group.created_by=new.sender_id then v_rank:=5;
 elsif exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=new.sender_id and role in ('owner','admin')) then v_rank:=4;
 else select coalesce(max(rank),0) into v_rank from public.rim_zladen_chat_roles where conversation_id=new.conversation_id and user_id=new.sender_id;end if;
 if v_rank<4 then v_reply:='Настраивать фильтры могут только владелец и администраторы группы.';
 else
  v_action:=lower(split_part(v_rest,' ',1));
  if v_action='links' and lower(split_part(v_rest,' ',2)) in ('on','off') then
   insert into public.rim_zladen_filter_settings(conversation_id,links_enabled,updated_by,updated_at) values(new.conversation_id,lower(split_part(v_rest,' ',2))='on',new.sender_id,now())
   on conflict(conversation_id) do update set links_enabled=excluded.links_enabled,updated_by=excluded.updated_by,updated_at=now();
   v_reply:='Фильтр ссылок '||case when lower(split_part(v_rest,' ',2))='on' then 'включён.' else 'выключен.' end;
  elsif v_action='word' and lower(split_part(v_rest,' ',2)) in ('add','del','remove') then
   v_term:=lower(btrim(substr(v_rest,length(split_part(v_rest,' ',1))+length(split_part(v_rest,' ',2))+3)));
   if length(v_term)<2 or length(v_term)>64 or v_term ~ '[[:cntrl:]]' then v_reply:='Фраза должна содержать 2–64 символа без управляющих знаков.';
   elsif lower(split_part(v_rest,' ',2))='add' then
    insert into public.rim_zladen_filter_settings(conversation_id,blocked_terms,updated_by,updated_at) values(new.conversation_id,array[v_term],new.sender_id,now())
    on conflict(conversation_id) do update set blocked_terms=case when v_term=any(public.rim_zladen_filter_settings.blocked_terms) then public.rim_zladen_filter_settings.blocked_terms else array_append(public.rim_zladen_filter_settings.blocked_terms,v_term) end,updated_by=excluded.updated_by,updated_at=now();
    v_reply:='Фраза добавлена в фильтр.';
   else
    update public.rim_zladen_filter_settings set blocked_terms=array_remove(blocked_terms,v_term),updated_by=new.sender_id,updated_at=now() where conversation_id=new.conversation_id;
    v_reply:='Фраза удалена из фильтра, если она была добавлена.';
   end if;
  elsif v_action='words' then
   select string_agg(term,', ' order by term) into v_reply from public.rim_zladen_filter_settings s,unnest(s.blocked_terms) as term where s.conversation_id=new.conversation_id;
   v_reply:='Фразы в фильтре: '||coalesce(v_reply,'нет');
  elsif v_action='status' then
   select * into v_settings from public.rim_zladen_filter_settings where conversation_id=new.conversation_id;
   v_reply:='Фильтр ссылок: '||case when coalesce(v_settings.links_enabled,false) then 'включён' else 'выключен' end||E'\\n'||'Фраз в фильтре: '||cardinality(coalesce(v_settings.blocked_terms,'{}'::text[]))::text;
  else v_reply:='Фильтры Злыди: /filter links on|off · /filter word add ФРАЗА · /filter word del ФРАЗА · /filter words · /filter status';
  end if;
  insert into public.rim_zladen_audit(conversation_id,actor_id,action,details) values(new.conversation_id,new.sender_id,'content_filter_config',jsonb_build_object('command',v_action));
 end if;
 if v_reply is not null then insert into public.chat_messages(conversation_id,sender_id,body,client_message_id) values(new.conversation_id,v_bot.bot_user_id,left(v_reply,3000),'zladen-filter:'||new.id::text) on conflict(sender_id,client_message_id) do nothing;end if;
 return new;
end;
$$;
revoke all on function private.rim_zladen_filter_commands() from public,anon,authenticated;
drop trigger if exists rim_zladen_filter_commands_after_insert on public.chat_messages;
create trigger rim_zladen_filter_commands_after_insert after insert on public.chat_messages for each row execute function private.rim_zladen_filter_commands();
comment on table public.rim_zladen_filter_settings is 'Per-group Zladen link and administrator-defined word filters; direct access is revoked and E2E scopes are excluded.';
