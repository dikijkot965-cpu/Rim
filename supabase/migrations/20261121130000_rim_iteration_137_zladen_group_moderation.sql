-- RIM Iteration 137 — Zladen group administration foundation.
-- Adds real server-side group moderation and configuration. No arbitrary user code.
-- The bot must be a member of the group before it can process group commands.

create table if not exists public.rim_zladen_group_settings (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  welcome_enabled boolean not null default true,
  welcome_text text not null default 'Добро пожаловать в группу! Прочитай /rules.',
  rules_text text not null default 'Правила пока не заданы администратором.',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint rim_zladen_welcome_length check (char_length(welcome_text) between 1 and 1000),
  constraint rim_zladen_rules_length check (char_length(rules_text) between 1 and 4000)
);

create table if not exists public.rim_zladen_warnings (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  moderator_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default 'Причина не указана',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  cleared_at timestamptz,
  cleared_by uuid references auth.users(id) on delete set null
);
create index if not exists rim_zladen_warnings_active_idx
  on public.rim_zladen_warnings(conversation_id,user_id,created_at desc) where active;

create table if not exists public.rim_zladen_mutes (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  muted_by uuid not null references auth.users(id) on delete cascade,
  reason text not null default 'Причина не указана',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key(conversation_id,user_id)
);
create index if not exists rim_zladen_mutes_expiry_idx on public.rim_zladen_mutes(expires_at);

create table if not exists public.rim_zladen_bans (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  banned_by uuid not null references auth.users(id) on delete cascade,
  reason text not null default 'Причина не указана',
  created_at timestamptz not null default now(),
  primary key(conversation_id,user_id)
);

create table if not exists public.rim_zladen_custom_commands (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  command text not null,
  response text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key(conversation_id,command),
  constraint rim_zladen_custom_command_name check (command ~ '^[a-z0-9_]{2,24}$'),
  constraint rim_zladen_custom_command_response check (char_length(response) between 1 and 1500)
);

create table if not exists public.rim_zladen_audit (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists rim_zladen_audit_group_idx on public.rim_zladen_audit(conversation_id,created_at desc);

alter table public.rim_zladen_group_settings enable row level security;
alter table public.rim_zladen_warnings enable row level security;
alter table public.rim_zladen_mutes enable row level security;
alter table public.rim_zladen_bans enable row level security;
alter table public.rim_zladen_custom_commands enable row level security;
alter table public.rim_zladen_audit enable row level security;
revoke all on public.rim_zladen_group_settings,public.rim_zladen_warnings,public.rim_zladen_mutes,
  public.rim_zladen_bans,public.rim_zladen_custom_commands,public.rim_zladen_audit from anon,authenticated;

-- Re-enable a previously blocked/unsubscribed personal Zladen chat without creating a duplicate.
create or replace function public.rim_zladen_set_install_state(p_user_id uuid,p_state text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth as $$
declare
  v_install public.rim_system_bot_installs%rowtype;
  v_bot public.rim_system_bot_registry%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if p_user_id is null or p_state is null or p_state not in ('active','blocked','unsubscribed') then
    raise exception 'invalid_install_state' using errcode='22023';
  end if;
  select * into v_install from public.rim_system_bot_installs where user_id=p_user_id and bot_key='zladen' for update;
  if not found then raise exception 'zladen_install_not_found' using errcode='P0002'; end if;
  update public.rim_system_bot_installs set state=p_state,updated_at=now()
    where user_id=p_user_id and bot_key='zladen' returning * into v_install;
  if p_state='active' then
    select * into v_bot from public.rim_system_bot_registry where bot_key='zladen' and is_active=true;
    if v_bot.bot_user_id is null then raise exception 'zladen_not_provisioned' using errcode='P0001'; end if;
    if v_install.conversation_id is null or not exists(select 1 from public.conversations where id=v_install.conversation_id) then
      -- The installer creates a replacement personal chat if the previous one was deleted.
      perform public.rim_zladen_install_for_user(p_user_id);
      select * into v_install from public.rim_system_bot_installs where user_id=p_user_id and bot_key='zladen';
    else
      insert into public.conversation_members(conversation_id,user_id)
        values(v_install.conversation_id,p_user_id),(v_install.conversation_id,v_bot.bot_user_id)
        on conflict do nothing;
    end if;
  elsif v_install.conversation_id is not null then
    delete from public.conversation_members where conversation_id=v_install.conversation_id and user_id=p_user_id;
  end if;
  return jsonb_build_object('state',v_install.state,'conversation_id',v_install.conversation_id);
end $$;
revoke all on function public.rim_zladen_set_install_state(uuid,text) from public,anon,authenticated;
grant execute on function public.rim_zladen_set_install_state(uuid,text) to service_role;

-- A banned user cannot be silently re-added to the same group.
create or replace function private.rim_zladen_block_banned_member()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
begin
  if exists(select 1 from public.conversations c where c.id=new.conversation_id and c.type='group')
     and exists(select 1 from public.rim_zladen_bans b where b.conversation_id=new.conversation_id and b.user_id=new.user_id) then
    raise exception 'rim_zladen_group_ban_active' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function private.rim_zladen_block_banned_member() from public,anon,authenticated;
drop trigger if exists rim_zladen_block_banned_member on public.conversation_members;
create trigger rim_zladen_block_banned_member before insert on public.conversation_members
for each row execute function private.rim_zladen_block_banned_member();

-- Enforce active Zladen mutes at the database boundary, not only in the UI.
create or replace function private.rim_zladen_enforce_group_mute()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare v_expires timestamptz;
begin
  if exists(select 1 from public.conversations c where c.id=new.conversation_id and c.type='group') then
    select expires_at into v_expires from public.rim_zladen_mutes
      where conversation_id=new.conversation_id and user_id=new.sender_id;
    if v_expires is not null and v_expires > now() then
      raise exception 'rim_zladen_muted_until:%',v_expires using errcode='42501';
    elsif v_expires is not null then
      delete from public.rim_zladen_mutes where conversation_id=new.conversation_id and user_id=new.sender_id;
    end if;
  end if;
  return new;
end $$;
revoke all on function private.rim_zladen_enforce_group_mute() from public,anon,authenticated;
drop trigger if exists rim_zladen_enforce_group_mute on public.chat_messages;
create trigger rim_zladen_enforce_group_mute before insert on public.chat_messages
for each row execute function private.rim_zladen_enforce_group_mute();

-- Group welcome message; only runs when Zladen is present and the new member is not the bot.
create or replace function private.rim_zladen_group_welcome()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare
  v_bot public.rim_system_bot_registry%rowtype;
  v_group public.conversations%rowtype;
  v_text text;
begin
  select * into v_group from public.conversations where id=new.conversation_id and type='group';
  if not found then return new; end if;
  if coalesce(v_group.e2e_mode,'off')='required' then return new; end if;
  select * into v_bot from public.rim_system_bot_registry where bot_key='zladen' and is_active=true;
  if v_bot.bot_user_id is null or new.user_id=v_bot.bot_user_id then return new; end if;
  if not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=v_bot.bot_user_id) then return new; end if;
  insert into public.rim_zladen_group_settings(conversation_id) values(new.conversation_id) on conflict do nothing;
  select welcome_text into v_text from public.rim_zladen_group_settings where conversation_id=new.conversation_id and welcome_enabled;
  if v_text is null then return new; end if;
  insert into public.chat_messages(conversation_id,sender_id,body,client_message_id)
  values(new.conversation_id,v_bot.bot_user_id,replace(v_text,'{user_id}',new.user_id::text),
    'zladen-welcome-group:'||new.conversation_id::text||':'||new.user_id::text)
  on conflict(sender_id,client_message_id) do nothing;
  return new;
end $$;
revoke all on function private.rim_zladen_group_welcome() from public,anon,authenticated;
drop trigger if exists rim_zladen_group_welcome on public.conversation_members;
create trigger rim_zladen_group_welcome after insert on public.conversation_members
for each row execute function private.rim_zladen_group_welcome();

-- Unified direct-chat and group command dispatcher.
create or replace function private.rim_zladen_handle_message()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare
  v_bot public.rim_system_bot_registry%rowtype;
  v_group public.conversations%rowtype;
  v_command text;
  v_rest text;
  v_reply text;
  v_target uuid;
  v_minutes integer;
  v_reason text;
  v_actor_manager boolean := false;
  v_target_count integer;
  v_rules text;
  v_custom text;
  v_username text;
begin
  if new.sender_id is null or coalesce(new.body,'')='' then return new; end if;
  select * into v_bot from public.rim_system_bot_registry where bot_key='zladen' and is_active=true;
  if not found or v_bot.bot_user_id is null or new.sender_id=v_bot.bot_user_id then return new; end if;
  if not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=v_bot.bot_user_id) then return new; end if;
  if exists(select 1 from public.rim_system_bot_installs where user_id=new.sender_id and bot_key='zladen' and state in ('blocked','unsubscribed')) then return new; end if;

  select * into v_group from public.conversations where id=new.conversation_id;
  if not found then return new; end if;
  -- The bot must never inspect plaintext or inject plaintext replies into an E2E scope.
  if coalesce(v_group.e2e_mode,'off')='required' then return new; end if;
  v_command := regexp_replace(lower(split_part(btrim(new.body),' ',1)),'@zladen_bot$','');
  v_rest := btrim(substr(btrim(new.body),length(split_part(btrim(new.body),' ',1))+1));
  select (v_group.created_by=new.sender_id or exists(
    select 1 from public.conversation_members m where m.conversation_id=new.conversation_id
      and m.user_id=new.sender_id and m.role in ('owner','admin')
  )) into v_actor_manager;

  if v_command in ('/start','/help','/commands') then
    if v_group.type='group' then
      v_reply := 'Злыдя — помощник группы.'||E'\n'||
        '/rules — правила; /info — информация; /admins — администраторы; /stats — статистика.'||E'\n'||
        'Администраторам: /setrules текст, /setwelcome текст, /warn UUID причина, /warnings [UUID], /clearwarns UUID, /mute UUID минуты причина, /unmute UUID, /kick UUID, /ban UUID причина, /unban UUID, /command имя ответ, /delcommand имя.';
    else
      v_reply := 'Я Злыдя — системный помощник РИМа.'||E'\n'||'/start, /help, /commands, /ping, /id, /info.';
    end if;
  elsif v_command='/ping' then
    v_reply := 'На связи. Злыдя работает.';
  elsif v_command='/id' then
    v_reply := 'ID переписки: '||new.conversation_id::text||E'\n'||'Твой RIM ID: '||new.sender_id::text;
  elsif v_command='/info' then
    select count(*) into v_target_count from public.conversation_members where conversation_id=new.conversation_id;
    v_reply := coalesce(v_group.title,'Группа')||E'\n'||'Участников: '||v_target_count::text;
  elsif v_group.type='group' and v_command='/rules' then
    select rules_text into v_rules from public.rim_zladen_group_settings where conversation_id=new.conversation_id;
    v_reply := coalesce(v_rules,'Правила пока не заданы администратором.');
  elsif v_group.type='group' and v_command='/admins' then
    select string_agg(coalesce(p.display_name,p.username,m.user_id::text),E'\n') into v_reply
      from public.conversation_members m left join public.profiles p on p.id=m.user_id
      where m.conversation_id=new.conversation_id and (m.user_id=v_group.created_by or m.role in ('owner','admin'));
    v_reply := coalesce(v_reply,'Администраторы не найдены.');
  elsif v_group.type='group' and v_command='/stats' then
    select count(*) into v_target_count from public.conversation_members where conversation_id=new.conversation_id;
    v_reply := 'Участников: '||v_target_count::text||E'\n';
    select count(*) into v_target_count from public.rim_zladen_warnings where conversation_id=new.conversation_id and active;
    v_reply := v_reply||'Активных предупреждений: '||v_target_count::text||E'\n';
    select count(*) into v_target_count from public.rim_zladen_mutes where conversation_id=new.conversation_id and expires_at>now();
    v_reply := v_reply||'Активных ограничений: '||v_target_count::text;
  elsif v_group.type='group' and v_command='/setrules' then
    if not v_actor_manager then v_reply := 'Команда доступна только администраторам.';
    elsif length(v_rest)<3 or length(v_rest)>4000 then v_reply := 'Укажи текст правил (3–4000 символов).';
    else
      insert into public.rim_zladen_group_settings(conversation_id,rules_text,updated_by)
      values(new.conversation_id,v_rest,new.sender_id)
      on conflict(conversation_id) do update set rules_text=excluded.rules_text,updated_by=excluded.updated_by,updated_at=now();
      v_reply := 'Правила группы обновлены.';
      insert into public.rim_zladen_audit(conversation_id,actor_id,action,details) values(new.conversation_id,new.sender_id,'set_rules',jsonb_build_object('length',length(v_rest)));
    end if;
  elsif v_group.type='group' and v_command='/setwelcome' then
    if not v_actor_manager then v_reply := 'Команда доступна только администраторам.';
    elsif length(v_rest)<3 or length(v_rest)>1000 then v_reply := 'Укажи текст приветствия (3–1000 символов).';
    else
      insert into public.rim_zladen_group_settings(conversation_id,welcome_text,updated_by)
      values(new.conversation_id,v_rest,new.sender_id)
      on conflict(conversation_id) do update set welcome_text=excluded.welcome_text,welcome_enabled=true,updated_by=excluded.updated_by,updated_at=now();
      v_reply := 'Приветствие группы обновлено.';
      insert into public.rim_zladen_audit(conversation_id,actor_id,action,details) values(new.conversation_id,new.sender_id,'set_welcome',jsonb_build_object('length',length(v_rest)));
    end if;
  elsif v_group.type='group' and v_command in ('/warn','/warnings','/clearwarns','/mute','/unmute','/kick','/ban','/unban') then
    if v_command='/warnings' and v_rest='' then v_target := new.sender_id;
    else
      begin v_target := nullif(split_part(v_rest,' ',1),'')::uuid;
      exception when others then v_target := null; end;
    end if;
    if v_target is null then v_reply := 'Нужен корректный UUID участника. Используй /id для своего ID.';
    elsif v_command='/warnings' and v_target<>new.sender_id and not v_actor_manager then v_reply := 'Посмотреть предупреждения другого участника может только администратор.';
    elsif v_command='/warnings' then
      select count(*) into v_target_count from public.rim_zladen_warnings where conversation_id=new.conversation_id and user_id=v_target and active;
      v_reply := 'Активных предупреждений: '||v_target_count::text;
    elsif not v_actor_manager then v_reply := 'Команды модерации доступны только администраторам.';
    elsif v_command<>'/unban' and not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=v_target) then v_reply := 'Участник не найден в этой группе.';
    elsif v_target=new.sender_id or v_target=v_group.created_by or exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=v_target and role in ('owner','admin')) then v_reply := 'Нельзя применить это действие к себе, владельцу или администратору.';
    elsif v_command='/warn' then
      v_reason := coalesce(nullif(btrim(regexp_replace(v_rest,'^[^ ]+[ ]*','')),''),'Причина не указана');
      insert into public.rim_zladen_warnings(conversation_id,user_id,moderator_id,reason) values(new.conversation_id,v_target,new.sender_id,left(v_reason,500));
      select count(*) into v_target_count from public.rim_zladen_warnings where conversation_id=new.conversation_id and user_id=v_target and active;
      v_reply := 'Предупреждение выдано. Всего активных: '||v_target_count::text;
      insert into public.rim_zladen_audit(conversation_id,actor_id,action,target_user_id,details) values(new.conversation_id,new.sender_id,'warn',v_target,jsonb_build_object('reason',left(v_reason,500)));
    elsif v_command='/clearwarns' then
      update public.rim_zladen_warnings set active=false,cleared_at=now(),cleared_by=new.sender_id where conversation_id=new.conversation_id and user_id=v_target and active;
      get diagnostics v_target_count = row_count;
      v_reply := 'Снято предупреждений: '||v_target_count::text;
      insert into public.rim_zladen_audit(conversation_id,actor_id,action,target_user_id) values(new.conversation_id,new.sender_id,'clear_warnings',v_target);
    elsif v_command='/mute' then
      begin v_minutes := split_part(v_rest,' ',2)::integer; exception when others then v_minutes := null; end;
      if v_minutes is null or v_minutes<1 or v_minutes>10080 then v_reply := 'Формат: /mute UUID минуты причина (1–10080).';
      else
        v_reason := coalesce(nullif(btrim(regexp_replace(v_rest,'^[^ ]+[ ]+[^ ]+[ ]*','')),''),'Причина не указана');
        insert into public.rim_zladen_mutes(conversation_id,user_id,muted_by,reason,expires_at)
        values(new.conversation_id,v_target,new.sender_id,left(v_reason,500),now()+make_interval(mins=>v_minutes))
        on conflict(conversation_id,user_id) do update set muted_by=excluded.muted_by,reason=excluded.reason,expires_at=excluded.expires_at,created_at=now();
        v_reply := 'Ограничение отправки сообщений установлено на '||v_minutes::text||' мин.';
        insert into public.rim_zladen_audit(conversation_id,actor_id,action,target_user_id,details) values(new.conversation_id,new.sender_id,'mute',v_target,jsonb_build_object('minutes',v_minutes,'reason',left(v_reason,500)));
      end if;
    elsif v_command='/unmute' then
      delete from public.rim_zladen_mutes where conversation_id=new.conversation_id and user_id=v_target;
      v_reply := 'Ограничение снято (если оно было активно).';
      insert into public.rim_zladen_audit(conversation_id,actor_id,action,target_user_id) values(new.conversation_id,new.sender_id,'unmute',v_target);
    elsif v_command='/kick' then
      delete from public.conversation_members where conversation_id=new.conversation_id and user_id=v_target;
      v_reply := 'Участник исключён из группы.';
      insert into public.rim_zladen_audit(conversation_id,actor_id,action,target_user_id) values(new.conversation_id,new.sender_id,'kick',v_target);
    elsif v_command='/ban' then
      v_reason := coalesce(nullif(btrim(regexp_replace(v_rest,'^[^ ]+[ ]*','')),''),'Причина не указана');
      insert into public.rim_zladen_bans(conversation_id,user_id,banned_by,reason) values(new.conversation_id,v_target,new.sender_id,left(v_reason,500))
      on conflict(conversation_id,user_id) do update set banned_by=excluded.banned_by,reason=excluded.reason,created_at=now();
      delete from public.conversation_members where conversation_id=new.conversation_id and user_id=v_target;
      v_reply := 'Участник заблокирован в группе и исключён.';
      insert into public.rim_zladen_audit(conversation_id,actor_id,action,target_user_id,details) values(new.conversation_id,new.sender_id,'ban',v_target,jsonb_build_object('reason',left(v_reason,500)));
    elsif v_command='/unban' then
      delete from public.rim_zladen_bans where conversation_id=new.conversation_id and user_id=v_target;
      v_reply := 'Блокировка в группе снята. Для возвращения участника добавьте его снова.';
      insert into public.rim_zladen_audit(conversation_id,actor_id,action,target_user_id) values(new.conversation_id,new.sender_id,'unban',v_target);
    end if;
  elsif v_group.type='group' and v_command='/command' then
    if not v_actor_manager then v_reply := 'Команда доступна только администраторам.';
    else
      v_username := lower(split_part(v_rest,' ',1));
      v_custom := btrim(substr(v_rest,length(v_username)+2));
      if v_username !~ '^[a-z0-9_]{2,24}$' or v_custom='' or length(v_custom)>1500 then v_reply := 'Формат: /command имя текст ответа.';
      else
        insert into public.rim_zladen_custom_commands(conversation_id,command,response,created_by)
        values(new.conversation_id,v_username,v_custom,new.sender_id)
        on conflict(conversation_id,command) do update set response=excluded.response,created_by=excluded.created_by,updated_at=now();
        v_reply := 'Команда /'||v_username||' сохранена.';
      end if;
    end if;
  elsif v_group.type='group' and v_command='/delcommand' then
    if not v_actor_manager then v_reply := 'Команда доступна только администраторам.';
    else
      v_username := lower(split_part(v_rest,' ',1));
      delete from public.rim_zladen_custom_commands where conversation_id=new.conversation_id and command=v_username;
      v_reply := 'Команда удалена (если существовала).';
    end if;
  elsif v_group.type='group' and v_command ~ '^/[a-z0-9_]{2,24}$' then
    select response into v_custom from public.rim_zladen_custom_commands
      where conversation_id=new.conversation_id and command=substr(v_command,2);
    v_reply := v_custom;
  end if;

  if v_reply is not null and length(v_reply)>0 then
    insert into public.chat_messages(conversation_id,sender_id,body,client_message_id)
    values(new.conversation_id,v_bot.bot_user_id,left(v_reply,4000),'zladen-command:'||new.id::text)
    on conflict(sender_id,client_message_id) do nothing;
    update public.conversations set last_message_at=now() where id=new.conversation_id;
  end if;
  return new;
end $$;
revoke all on function private.rim_zladen_handle_message() from public,anon,authenticated;
drop trigger if exists rim_zladen_handle_message on public.chat_messages;
create trigger rim_zladen_handle_message after insert on public.chat_messages
for each row execute function private.rim_zladen_handle_message();

comment on table public.rim_zladen_group_settings is 'Per-group configuration for the first-party Zladen assistant.';
comment on table public.rim_zladen_audit is 'Append-only moderation/configuration event history for Zladen-managed groups.';
