-- RIM Iteration 140 — command aliases, permission management and report queue.
-- Additive only. Every operation is server-authorized; E2E-required scopes are skipped.

-- Private transaction marker distinguishes server-generated alias dispatches from
-- client-controlled message metadata. It exists only for the nested insert.
create table if not exists private.rim_zladen_internal_dispatch (
  transaction_id bigint not null,
  conversation_id uuid not null,
  user_id uuid not null,
  purpose text not null check(purpose in ('alias')),
  primary key(transaction_id,conversation_id,user_id,purpose)
);
revoke all on private.rim_zladen_internal_dispatch from public,anon,authenticated;

-- Alias-generated synthetic command messages are not new human activity and must
-- not be counted a second time or consume the anti-flood budget.
create or replace function private.rim_zladen_rate_limit_message()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare
  v_group public.conversations%rowtype;
  v_cfg public.rim_zladen_antispam_settings%rowtype;
  v_bot public.rim_system_bot_registry%rowtype;
  v_hash text;
  v_count integer;
  v_dupes integer;
begin
  if exists(select 1 from private.rim_zladen_internal_dispatch where transaction_id=txid_current() and conversation_id=new.conversation_id and user_id=new.sender_id and purpose='alias') then return new; end if;
  select * into v_group from public.conversations where id=new.conversation_id;
  if not found or v_group.type<>'group' or coalesce(v_group.e2e_mode,'off')='required' then return new; end if;
  if coalesce(new.body,'')='' then return new; end if;
  select * into v_bot from public.rim_system_bot_registry where bot_key='zladen';
  if new.sender_id=v_bot.bot_user_id or exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=new.sender_id and role in ('owner','admin')) then return new; end if;
  select * into v_cfg from public.rim_zladen_antispam_settings where conversation_id=new.conversation_id;
  if not found or not v_cfg.enabled then return new; end if;
  v_hash:=md5(left(new.body,4000));
  insert into public.rim_zladen_rate_buckets(conversation_id,user_id,window_started_at,message_count,last_body_hash,duplicate_count,updated_at)
  values(new.conversation_id,new.sender_id,now(),1,v_hash,1,now())
  on conflict(conversation_id,user_id) do update set
    window_started_at=case when public.rim_zladen_rate_buckets.window_started_at < now()-make_interval(secs=>v_cfg.window_seconds) then now() else public.rim_zladen_rate_buckets.window_started_at end,
    message_count=case when public.rim_zladen_rate_buckets.window_started_at < now()-make_interval(secs=>v_cfg.window_seconds) then 1 else public.rim_zladen_rate_buckets.message_count+1 end,
    duplicate_count=case when public.rim_zladen_rate_buckets.window_started_at < now()-make_interval(secs=>v_cfg.window_seconds) then 1 when public.rim_zladen_rate_buckets.last_body_hash=v_hash then public.rim_zladen_rate_buckets.duplicate_count+1 else 1 end,
    last_body_hash=v_hash,updated_at=now()
  returning message_count,duplicate_count into v_count,v_dupes;
  if v_count>v_cfg.max_messages or v_dupes>v_cfg.max_duplicates then
    insert into public.rim_zladen_audit(conversation_id,actor_id,action,details)
    values(new.conversation_id,new.sender_id,'antispam_block',jsonb_build_object('message_count',v_count,'duplicate_count',v_dupes));
    return null;
  end if;
  return new;
end $$;

create or replace function private.rim_zladen_track_message_stats()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare v_bot_id uuid;
begin
  if exists(select 1 from private.rim_zladen_internal_dispatch where transaction_id=txid_current() and conversation_id=new.conversation_id and user_id=new.sender_id and purpose='alias') then return new; end if;
  select bot_user_id into v_bot_id from public.rim_system_bot_registry where bot_key='zladen';
  if new.sender_id is null or new.sender_id=v_bot_id then return new; end if;
  insert into public.rim_zladen_chat_member_stats(conversation_id,user_id,message_count,first_message_at,last_message_at)
  values(new.conversation_id,new.sender_id,1,coalesce(new.created_at,now()),coalesce(new.created_at,now()))
  on conflict(conversation_id,user_id) do update set message_count=public.rim_zladen_chat_member_stats.message_count+1,last_message_at=excluded.last_message_at;
  return new;
end $$;

-- Single management handler for aliases, command access and report triage.
create or replace function private.rim_zladen_manage_commands()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare
  v_bot public.rim_system_bot_registry%rowtype;
  v_group public.conversations%rowtype;
  v_token text;
  v_command text;
  v_rest text;
  v_rank integer:=0;
  v_reply text;
  v_parts text[];
  v_alias text;
  v_target_command text;
  v_min_rank integer;
  v_enabled boolean;
  v_report_id uuid;
  v_status text;
  v_note text;
  v_rows integer;
begin
  if new.sender_id is null or coalesce(new.body,'')='' then return new; end if;
  if exists(select 1 from private.rim_zladen_internal_dispatch where transaction_id=txid_current() and conversation_id=new.conversation_id and user_id=new.sender_id and purpose='alias') then return new; end if;
  select * into v_bot from public.rim_system_bot_registry where bot_key='zladen' and is_active=true;
  if not found or v_bot.bot_user_id is null or new.sender_id=v_bot.bot_user_id then return new; end if;
  if not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=v_bot.bot_user_id) then return new; end if;
  select * into v_group from public.conversations where id=new.conversation_id;
  if not found or v_group.type<>'group' or coalesce(v_group.e2e_mode,'off')='required' then return new; end if;
  if exists(select 1 from public.rim_system_bot_installs where user_id=new.sender_id and bot_key='zladen' and state in ('blocked','unsubscribed')) then return new; end if;

  v_token:=lower(split_part(btrim(new.body),' ',1));
  if v_token !~ '^[/!.]' then return new; end if;
  v_command:=regexp_replace(v_token,'^[/!.]','');
  v_command:=regexp_replace(v_command,'@'||coalesce(v_bot.username,'zladen_bot')||'$','');
  v_rest:=btrim(substr(btrim(new.body),length(split_part(btrim(new.body),' ',1))+1));
  if v_group.created_by=new.sender_id then v_rank:=5;
  elsif exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=new.sender_id and role in ('owner','admin')) then v_rank:=4;
  else select coalesce(max(rank),0) into v_rank from public.rim_zladen_chat_roles where conversation_id=new.conversation_id and user_id=new.sender_id; end if;

  if v_command='menu' then
    v_reply:='ДОПОЛНИТЕЛЬНЫЕ ИНСТРУМЕНТЫ ЗЛЫДИ' || E'\n'||
      '/settings — настройки Злыди в этой группе'||E'\n'||
      '/commands — индивидуальные ограничения команд'||E'\n'||
      '/aliases — список псевдонимов'||E'\n'||
      '/reports — очередь жалоб для администрации'||E'\n'||
      'Администраторы: /alias add псевдоним команда • /alias del псевдоним'||E'\n'||
      '/setcommand команда on|off [ранг]'||E'\n'||'/setwelcome on|off • /setrules clear';
  elsif v_command='alias' then
    if v_rank<4 then v_reply:='Управлять псевдонимами команд могут только администраторы.';
    else
      v_parts:=regexp_split_to_array(v_rest,'\s+');
      if coalesce(v_parts[1],'')='add' then
        v_alias:=lower(coalesce(v_parts[2],''));
        v_target_command:=lower(coalesce(v_parts[3],''));
        if v_alias !~ '^[a-zа-яё0-9_]{2,32}$' or v_target_command !~ '^[a-z0-9_]{2,32}$' or v_target_command in ('alias','setcommand','reports','reportresolve') then
          v_reply:='Формат: /alias add псевдоним команда. Например: /alias add правила rules';
        elsif v_alias in ('start','help','commands','ping','id','info','rules','admins','stats','setrules','setwelcome','warn','warnings','clearwarns','mute','unmute','kick','ban','unban','command','delcommand','me','who','profile','privacy','bio','tag','balance','grant','pay','rep','award','awards','top','bookmark','bookmarks','unbookmark','poll','vote','pollclose','pollresults','remind','antispam','rank','report','alias','aliases','settings','reports','reportresolve','setcommand','menu','zladen','возможности') then
          v_reply:='Этот псевдоним зарезервирован и не может перекрывать встроенную команду.';
        elsif v_target_command not in ('rules','info','admins','stats','warn','warnings','clearwarns','mute','unmute','kick','ban','unban','setrules','setwelcome','command','delcommand','me','who','profile','privacy','bio','tag','balance','grant','pay','rep','award','awards','top','bookmark','bookmarks','unbookmark','poll','vote','pollclose','pollresults','remind','antispam','rank','report','menu','ping','id') then
          v_reply:='Неизвестная команда назначения. Укажи существующую команду Злыди.';
        else
          insert into public.rim_zladen_command_aliases(conversation_id,alias,command,created_by)
          values(new.conversation_id,v_alias,v_target_command,new.sender_id)
          on conflict(conversation_id,alias) do update set command=excluded.command,created_by=excluded.created_by,created_at=now();
          v_reply:='Псевдоним /'||v_alias||' теперь вызывает /'||v_target_command||'.';
          insert into public.rim_zladen_audit(conversation_id,actor_id,action,details)
          values(new.conversation_id,new.sender_id,'command_alias_set',jsonb_build_object('alias',v_alias,'command',v_target_command));
        end if;
      elsif coalesce(v_parts[1],'') in ('del','remove') then
        v_alias:=lower(coalesce(v_parts[2],''));
        if v_alias='' then v_reply:='Формат: /alias del псевдоним';
        else
          delete from public.rim_zladen_command_aliases where conversation_id=new.conversation_id and alias=v_alias;
          get diagnostics v_rows=row_count;
          v_reply:=case when v_rows>0 then 'Псевдоним удалён.' else 'Такого псевдонима не было.' end;
          insert into public.rim_zladen_audit(conversation_id,actor_id,action,details)
          values(new.conversation_id,new.sender_id,'command_alias_deleted',jsonb_build_object('alias',v_alias));
        end if;
      else v_reply:='Команды: /alias add псевдоним команда • /alias del псевдоним • /aliases';
      end if;
    end if;
  elsif v_command='aliases' then
    select string_agg('/'||alias||' → /'||command,E'\n' order by alias) into v_reply
    from public.rim_zladen_command_aliases where conversation_id=new.conversation_id;
    v_reply:='Псевдонимы команд этой группы:'||E'\n'||coalesce(v_reply,'Пока не настроены.');
  elsif v_command='setcommand' then
    if v_rank<4 then v_reply:='Настраивать доступ к командам могут только администраторы.';
    else
      v_parts:=regexp_split_to_array(v_rest,'\s+');
      v_target_command:=lower(coalesce(v_parts[1],''));
      if v_target_command !~ '^[a-z0-9_]{2,32}$' or coalesce(v_parts[2],'') not in ('on','off') then
        v_reply:='Формат: /setcommand команда on|off [минимальный_ранг 0–5].';
      else
        v_enabled:=v_parts[2]='on';
        begin v_min_rank:=coalesce(v_parts[3],'0')::integer; exception when others then v_min_rank:=-1; end;
        if v_min_rank<0 or v_min_rank>5 then v_reply:='Минимальный ранг должен быть от 0 до 5.';
        elsif v_target_command in ('setcommand','alias','aliases','reportresolve','reports') and not v_enabled then v_reply:='Нельзя отключить системные команды управления.';
        else
          insert into public.rim_zladen_command_permissions(conversation_id,command,enabled,min_rank,updated_by)
          values(new.conversation_id,v_target_command,v_enabled,v_min_rank,new.sender_id)
          on conflict(conversation_id,command) do update set enabled=excluded.enabled,min_rank=excluded.min_rank,updated_by=excluded.updated_by,updated_at=now();
          v_reply:='Доступ к /'||v_target_command||' обновлён: '||case when v_enabled then 'включён' else 'отключён' end||', минимальный ранг '||v_min_rank::text||'.';
          insert into public.rim_zladen_audit(conversation_id,actor_id,action,details)
          values(new.conversation_id,new.sender_id,'command_permission_set',jsonb_build_object('command',v_target_command,'enabled',v_enabled,'min_rank',v_min_rank));
        end if;
      end if;
    end if;
  elsif v_command='commands' then
    select string_agg('/'||command||case when not enabled then ' [выключена]' when min_rank>0 then ' [ранг '||min_rank::text||'+]' else '' end,E'\n' order by command)
    into v_reply from public.rim_zladen_command_permissions where conversation_id=new.conversation_id;
    v_reply:='Индивидуальные ограничения команд:'||E'\n'||coalesce(v_reply,'Для команд не задано отдельных ограничений.');
  elsif v_command='settings' then
    select 'Антифлуд: '||case when coalesce(a.enabled,false) then 'включён' else 'выключен' end||E'\n'||
      'Приветствия: '||case when coalesce(s.welcome_enabled,true) then 'включены' else 'выключены' end||E'\n'||
      'Правила: '||case when coalesce(s.rules_text,'')='' then 'не заданы' else 'заданы' end
    into v_reply from (select 1) q
    left join public.rim_zladen_antispam_settings a on a.conversation_id=new.conversation_id
    left join public.rim_zladen_group_settings s on s.conversation_id=new.conversation_id;
    v_reply:='НАСТРОЙКИ ЗЛЫДИ' || E'\n'||coalesce(v_reply,'Настройки ещё не созданы.')||E'\n\n'||
      'Команды: /setrules • /setwelcome • /antispam on|off • /setcommand';
  elsif v_command='reports' then
    if v_rank<4 then v_reply:='Очередь жалоб доступна администрации.';
    else
      select string_agg(id::text||' — '||left(reason,90)||' ['||status||']',E'\n' order by created_at) into v_reply
      from (select id,reason,status,created_at from public.rim_zladen_reports where conversation_id=new.conversation_id and status in ('open','reviewing') order by created_at limit 10) r;
      v_reply:='ОТКРЫТЫЕ ЖАЛОБЫ' || E'\n'||coalesce(v_reply,'Очередь пуста.')||E'\n\n'||'Закрыть: /reportresolve UUID resolved|rejected комментарий';
    end if;
  elsif v_command='reportresolve' then
    if v_rank<4 then v_reply:='Рассматривать жалобы может только администрация.';
    else
      begin v_report_id:=split_part(v_rest,' ',1)::uuid; exception when others then v_report_id:=null; end;
      v_status:=lower(split_part(v_rest,' ',2));
      v_note:=btrim(substr(v_rest,length(split_part(v_rest,' ',1))+length(split_part(v_rest,' ',2))+3));
      if v_report_id is null or v_status not in ('resolved','rejected','reviewing') then v_reply:='Формат: /reportresolve UUID resolved|rejected|reviewing комментарий';
      else
        update public.rim_zladen_reports set status=v_status,assigned_to=case when v_status='reviewing' then new.sender_id else coalesce(assigned_to,new.sender_id) end,resolution=left(coalesce(v_note,''),1000),updated_at=now()
        where id=v_report_id and conversation_id=new.conversation_id;
        get diagnostics v_rows=row_count;
        v_reply:=case when v_rows>0 then 'Статус жалобы обновлён: '||v_status||'.' else 'Жалоба не найдена в этой группе.' end;
        if v_rows>0 then
          insert into public.rim_zladen_audit(conversation_id,actor_id,action,details)
          values(new.conversation_id,new.sender_id,'report_status_changed',jsonb_build_object('report_id',v_report_id,'status',v_status));
        end if;
      end if;
    end if;
  end if;

  if v_reply is not null then
    insert into public.chat_messages(conversation_id,sender_id,body,client_message_id)
    values(new.conversation_id,v_bot.bot_user_id,left(v_reply,4000),'zladen-manage:'||new.id::text)
    on conflict(sender_id,client_message_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function private.rim_zladen_manage_commands() from public,anon,authenticated;
drop trigger if exists rim_zladen_manage_commands on public.chat_messages;
create trigger rim_zladen_manage_commands after insert on public.chat_messages
for each row execute function private.rim_zladen_manage_commands();

-- Resolve one local alias to one canonical command. Synthetic messages carry a
-- private id prefix so this trigger cannot recurse and analytics stay accurate.
create or replace function private.rim_zladen_resolve_command_alias()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare
  v_bot public.rim_system_bot_registry%rowtype;
  v_group public.conversations%rowtype;
  v_token text;
  v_alias text;
  v_command text;
  v_rest text;
begin
  if new.sender_id is null or coalesce(new.body,'')='' then return new; end if;
  if exists(select 1 from private.rim_zladen_internal_dispatch where transaction_id=txid_current() and conversation_id=new.conversation_id and user_id=new.sender_id and purpose='alias') then return new; end if;
  select * into v_bot from public.rim_system_bot_registry where bot_key='zladen' and is_active=true;
  if not found or v_bot.bot_user_id is null or new.sender_id=v_bot.bot_user_id then return new; end if;
  select * into v_group from public.conversations where id=new.conversation_id and type='group';
  if not found or coalesce(v_group.e2e_mode,'off')='required' then return new; end if;
  if not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=v_bot.bot_user_id) then return new; end if;
  if exists(select 1 from public.rim_system_bot_installs where user_id=new.sender_id and bot_key='zladen' and state in ('blocked','unsubscribed')) then return new; end if;
  v_token:=lower(split_part(btrim(new.body),' ',1));
  if v_token !~ '^[/!.]' then return new; end if;
  v_alias:=regexp_replace(v_token,'^[/!.]','');
  v_alias:=regexp_replace(v_alias,'@'||coalesce(v_bot.username,'zladen_bot')||'$','');
  select command into v_command from public.rim_zladen_command_aliases where conversation_id=new.conversation_id and alias=v_alias;
  if v_command is null then return new; end if;
  v_rest:=btrim(substr(btrim(new.body),length(split_part(btrim(new.body),' ',1))+1));
  insert into private.rim_zladen_internal_dispatch(transaction_id,conversation_id,user_id,purpose)
  values(txid_current(),new.conversation_id,new.sender_id,'alias') on conflict do nothing;
  insert into public.chat_messages(conversation_id,sender_id,body,client_message_id)
  values(new.conversation_id,new.sender_id,'/'||v_command||case when v_rest='' then '' else ' '||v_rest end,'zladen-alias:'||new.id::text)
  on conflict(sender_id,client_message_id) do nothing;
  delete from private.rim_zladen_internal_dispatch where transaction_id=txid_current() and conversation_id=new.conversation_id and user_id=new.sender_id and purpose='alias';
  return new;
end $$;
revoke all on function private.rim_zladen_resolve_command_alias() from public,anon,authenticated;
drop trigger if exists rim_zladen_resolve_command_alias on public.chat_messages;
create trigger rim_zladen_resolve_command_alias after insert on public.chat_messages
for each row execute function private.rim_zladen_resolve_command_alias();

comment on function private.rim_zladen_manage_commands() is 'Server-side Zladen alias, command permission and report queue administration for non-E2E groups.';
comment on function private.rim_zladen_resolve_command_alias() is 'Resolves one group-local alias to a synthetic canonical command without duplicating user statistics.';

-- Enforce command access before AFTER INSERT command handlers run. This covers
-- both the old moderation dispatcher and the newer extended dispatcher, so an
-- alias cannot bypass a restriction. A denied command is not stored as a chat
-- message; the bot posts a deterministic denial notice instead.
create or replace function private.rim_zladen_command_gate()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare
  v_bot public.rim_system_bot_registry%rowtype;
  v_group public.conversations%rowtype;
  v_token text;
  v_command text;
  v_alias text;
  v_rank integer:=0;
  v_permission public.rim_zladen_command_permissions%rowtype;
begin
  if new.sender_id is null or coalesce(new.body,'')='' then return new; end if;
  if exists(select 1 from private.rim_zladen_internal_dispatch where transaction_id=txid_current() and conversation_id=new.conversation_id and user_id=new.sender_id and purpose='alias') then return new; end if;
  v_token:=lower(split_part(btrim(new.body),' ',1));
  if v_token !~ '^[/!.]' then return new; end if;
  select * into v_bot from public.rim_system_bot_registry where bot_key='zladen' and is_active=true;
  if not found or v_bot.bot_user_id is null or new.sender_id=v_bot.bot_user_id then return new; end if;
  select * into v_group from public.conversations where id=new.conversation_id and type='group';
  if not found or coalesce(v_group.e2e_mode,'off')='required' then return new; end if;
  if not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=v_bot.bot_user_id) then return new; end if;
  if exists(select 1 from public.rim_system_bot_installs where user_id=new.sender_id and bot_key='zladen' and state in ('blocked','unsubscribed')) then return new; end if;

  v_command:=regexp_replace(v_token,'^[/!.]','');
  v_command:=regexp_replace(v_command,'@'||coalesce(v_bot.username,'zladen_bot')||'$','');
  select command into v_alias from public.rim_zladen_command_aliases where conversation_id=new.conversation_id and alias=v_command;
  v_command:=coalesce(v_alias,v_command);
  select * into v_permission from public.rim_zladen_command_permissions where conversation_id=new.conversation_id and command=v_command;
  if not found then return new; end if;

  if v_group.created_by=new.sender_id then v_rank:=5;
  elsif exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=new.sender_id and role in ('owner','admin')) then v_rank:=4;
  else select coalesce(max(rank),0) into v_rank from public.rim_zladen_chat_roles where conversation_id=new.conversation_id and user_id=new.sender_id; end if;

  if not v_permission.enabled or v_rank<v_permission.min_rank then
    insert into public.chat_messages(conversation_id,sender_id,body,client_message_id)
    values(new.conversation_id,v_bot.bot_user_id,'Команда /'||v_command||' недоступна: недостаточно прав или она отключена.','zladen-command-denied:'||new.id::text)
    on conflict(sender_id,client_message_id) do nothing;
    return null;
  end if;
  return new;
end $$;
revoke all on function private.rim_zladen_command_gate() from public,anon,authenticated;
drop trigger if exists rim_zladen_command_gate on public.chat_messages;
create trigger rim_zladen_command_gate before insert on public.chat_messages
for each row execute function private.rim_zladen_command_gate();

comment on function private.rim_zladen_command_gate() is 'Enforces per-chat command permissions before any command dispatcher can execute; includes alias resolution and E2E exclusion.';

-- Explicitly support welcome toggles and rules reset without treating the
-- control words "on/off/clear" as literal user-facing text.
create or replace function private.rim_zladen_group_settings_gate()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare
  v_bot public.rim_system_bot_registry%rowtype;
  v_group public.conversations%rowtype;
  v_token text;
  v_command text;
  v_rest text;
  v_rank integer:=0;
  v_reply text;
begin
  if new.sender_id is null or coalesce(new.body,'')='' then return new; end if;
  select * into v_bot from public.rim_system_bot_registry where bot_key='zladen' and is_active=true;
  if not found or v_bot.bot_user_id is null or new.sender_id=v_bot.bot_user_id then return new; end if;
  select * into v_group from public.conversations where id=new.conversation_id and type='group';
  if not found or coalesce(v_group.e2e_mode,'off')='required' then return new; end if;
  if not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=v_bot.bot_user_id) then return new; end if;
  if exists(select 1 from public.rim_system_bot_installs where user_id=new.sender_id and bot_key='zladen' and state in ('blocked','unsubscribed')) then return new; end if;

  v_token:=lower(split_part(btrim(new.body),' ',1));
  if v_token !~ '^[/!.]' then return new; end if;
  v_command:=regexp_replace(v_token,'^[/!.]','');
  v_command:=regexp_replace(v_command,'@'||coalesce(v_bot.username,'zladen_bot')||'$','');
  v_rest:=lower(btrim(substr(btrim(new.body),length(split_part(btrim(new.body),' ',1))+1)));
  if not ((v_command='setwelcome' and v_rest in ('on','off')) or (v_command='setrules' and v_rest='clear')) then return new; end if;

  if v_group.created_by=new.sender_id then v_rank:=5;
  elsif exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=new.sender_id and role in ('owner','admin')) then v_rank:=4;
  else select coalesce(max(rank),0) into v_rank from public.rim_zladen_chat_roles where conversation_id=new.conversation_id and user_id=new.sender_id; end if;
  if v_rank<4 then return new; end if;

  insert into public.rim_zladen_group_settings(conversation_id) values(new.conversation_id) on conflict do nothing;
  if v_command='setwelcome' then
    update public.rim_zladen_group_settings set welcome_enabled=(v_rest='on'),updated_by=new.sender_id,updated_at=now() where conversation_id=new.conversation_id;
    v_reply:=case when v_rest='on' then 'Автоматические приветствия включены.' else 'Автоматические приветствия выключены.' end;
    insert into public.rim_zladen_audit(conversation_id,actor_id,action,details)
    values(new.conversation_id,new.sender_id,'welcome_toggle',jsonb_build_object('enabled',v_rest='on'));
  else
    update public.rim_zladen_group_settings set rules_text='Правила пока не заданы администратором.',updated_by=new.sender_id,updated_at=now() where conversation_id=new.conversation_id;
    v_reply:='Правила группы сброшены. Новые правила можно задать командой /setrules текст.';
    insert into public.rim_zladen_audit(conversation_id,actor_id,action,details)
    values(new.conversation_id,new.sender_id,'rules_reset','{}'::jsonb);
  end if;
  insert into public.chat_messages(conversation_id,sender_id,body,client_message_id)
  values(new.conversation_id,v_bot.bot_user_id,v_reply,'zladen-group-setting:'||new.id::text)
  on conflict(sender_id,client_message_id) do nothing;
  return null;
end $$;
revoke all on function private.rim_zladen_group_settings_gate() from public,anon,authenticated;
drop trigger if exists rim_zladen_group_settings_gate on public.chat_messages;
create trigger rim_zladen_group_settings_gate before insert on public.chat_messages
for each row execute function private.rim_zladen_group_settings_gate();

comment on function private.rim_zladen_group_settings_gate() is 'Handles /setwelcome on|off and /setrules clear before the legacy moderation handler; skips E2E-required groups.';
