-- RIM Iteration 139 — Zladen group arrival and onboarding.
-- Update only the untouched stock welcome; preserve any administrator customization.
alter table public.rim_zladen_group_settings
  alter column welcome_text set default '👋 Добро пожаловать, {user}! Прочитай /rules и загляни в /menu — там собраны возможности Злыди.';
update public.rim_zladen_group_settings
set welcome_text='👋 Добро пожаловать, {user}! Прочитай /rules и загляни в /menu — там собраны возможности Злыди.'
where welcome_text='Добро пожаловать в группу! Прочитай /rules.';

-- The bot greets the group when it is added and greets later members.
-- E2E-required conversations are deliberately excluded: no plaintext bot messages.

create or replace function private.rim_zladen_group_welcome()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare
  v_bot public.rim_system_bot_registry%rowtype;
  v_group public.conversations%rowtype;
  v_text text;
  v_name text;
  v_count bigint;
begin
  select * into v_group from public.conversations where id=new.conversation_id and type='group';
  if not found or coalesce(v_group.e2e_mode,'off')='required' then return new; end if;
  select * into v_bot from public.rim_system_bot_registry where bot_key='zladen' and is_active=true;
  if v_bot.bot_user_id is null or new.user_id=v_bot.bot_user_id then return new; end if;
  if not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=v_bot.bot_user_id) then return new; end if;

  insert into public.rim_zladen_group_settings(conversation_id) values(new.conversation_id) on conflict do nothing;
  select welcome_text into v_text from public.rim_zladen_group_settings
    where conversation_id=new.conversation_id and welcome_enabled;
  if v_text is null then return new; end if;

  select coalesce(nullif(p.display_name,''),nullif(p.username,''),'новый участник')
    into v_name from public.profiles p where p.id=new.user_id;
  v_name:=coalesce(v_name,'новый участник');
  select count(*) into v_count from public.conversation_members where conversation_id=new.conversation_id;
  v_text:=replace(v_text,'{user}',v_name);
  v_text:=replace(v_text,'{user_id}',new.user_id::text);
  v_text:=replace(v_text,'{count}',v_count::text);
  insert into public.chat_messages(conversation_id,sender_id,body,client_message_id)
  values(new.conversation_id,v_bot.bot_user_id,left(v_text,4000),
    'zladen-welcome-group:'||new.conversation_id::text||':'||new.user_id::text)
  on conflict(sender_id,client_message_id) do nothing;
  return new;
end $$;
revoke all on function private.rim_zladen_group_welcome() from public,anon,authenticated;
drop trigger if exists rim_zladen_group_welcome on public.conversation_members;
create trigger rim_zladen_group_welcome after insert on public.conversation_members
for each row execute function private.rim_zladen_group_welcome();

-- When the group admin adds Zladen, initialize settings and publish one welcome card.
create or replace function private.rim_zladen_group_bot_arrival()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare
  v_bot public.rim_system_bot_registry%rowtype;
  v_group public.conversations%rowtype;
  v_count bigint;
  v_message text;
begin
  select * into v_bot from public.rim_system_bot_registry where bot_key='zladen' and is_active=true;
  if v_bot.bot_user_id is null or new.user_id<>v_bot.bot_user_id then return new; end if;
  select * into v_group from public.conversations where id=new.conversation_id and type='group';
  if not found or coalesce(v_group.e2e_mode,'off')='required' then return new; end if;

  insert into public.rim_zladen_group_settings(conversation_id) values(new.conversation_id) on conflict do nothing;
  select count(*) into v_count from public.conversation_members where conversation_id=new.conversation_id;
  v_message:='Привет! Я Злыдя — системный помощник этой группы.'||E'\n\n'||
    'Я уже подключён и готов помогать с порядком, участниками и жизнью сообщества.'||E'\n\n'||
    'Для начала напиши /menu — покажу доступные команды.'||E'\n'||
    'Правила: /rules  •  Администрация: /admins  •  Информация: /info'||E'\n\n'||
    'Администраторы могут настроить приветствие командой /setwelcome и правила командой /setrules.'||E'\n'||
    'Участников в группе сейчас: '||v_count::text||'.';
  insert into public.chat_messages(conversation_id,sender_id,body,client_message_id)
  values(new.conversation_id,v_bot.bot_user_id,v_message,'zladen-group-arrival:'||new.conversation_id::text)
  on conflict(sender_id,client_message_id) do nothing;
  insert into public.rim_zladen_audit(conversation_id,actor_id,action,details)
  values(new.conversation_id,new.user_id,'zladen_added_to_group',jsonb_build_object('member_count',v_count));
  return new;
end $$;
revoke all on function private.rim_zladen_group_bot_arrival() from public,anon,authenticated;
drop trigger if exists rim_zladen_group_bot_arrival on public.conversation_members;
create trigger rim_zladen_group_bot_arrival after insert on public.conversation_members
for each row execute function private.rim_zladen_group_bot_arrival();

-- A compact in-chat command menu makes the first encounter self-explanatory.
-- Uses the existing unified command dispatcher and its server-side rank checks.
create or replace function private.rim_zladen_handle_menu_message()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare
  v_bot public.rim_system_bot_registry%rowtype;
  v_group public.conversations%rowtype;
  v_token text;
  v_command text;
  v_reply text;
  v_rank integer:=0;
begin
  if new.sender_id is null or coalesce(new.body,'')='' then return new; end if;
  select * into v_bot from public.rim_system_bot_registry where bot_key='zladen' and is_active=true;
  if not found or v_bot.bot_user_id is null or new.sender_id=v_bot.bot_user_id then return new; end if;
  if not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=v_bot.bot_user_id) then return new; end if;
  select * into v_group from public.conversations where id=new.conversation_id;
  if not found or coalesce(v_group.e2e_mode,'off')='required' then return new; end if;
  if exists(select 1 from public.rim_system_bot_installs where user_id=new.sender_id and bot_key='zladen' and state in ('blocked','unsubscribed')) then return new; end if;

  v_token:=lower(split_part(btrim(new.body),' ',1));
  v_command:=regexp_replace(v_token,'^[/!.]','');
  v_command:=regexp_replace(v_command,'@'||coalesce(v_bot.username,'zladen_bot')||'$','');
  if v_command not in ('menu','zladen','возможности') then return new; end if;

  if v_group.type='group' then
    if v_group.created_by=new.sender_id then v_rank:=5;
    elsif exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=new.sender_id and role in ('owner','admin')) then v_rank:=4;
    else select coalesce(max(rank),0) into v_rank from public.rim_zladen_chat_roles where conversation_id=new.conversation_id and user_id=new.sender_id; end if;
  end if;

  if v_group.type<>'group' then
    v_reply:='ЗЛЫДЯ • ЛИЧНЫЕ КОМАНДЫ'||E'\n'||
      '━━━━━━━━━━━━━━━━'||E'\n'||
      '/me — моя анкета'||E'\n'||
      '/who UUID или @username — анкета пользователя'||E'\n'||
      '/bio текст — описание'||E'\n'||
      '/tag текст — тег'||E'\n'||
      '/privacy public|members|private — приватность'||E'\n'||
      '/balance — баланс жетонов'||E'\n'||
      '/note название | текст — заметка'||E'\n'||
      '/notes — мои заметки'||E'\n'||
      '/bookmark UUID — закладка'||E'\n'||
      '/bookmarks — список закладок'||E'\n'||
      '/ping — проверка связи'||E'\n'||'/id — идентификаторы переписки и аккаунта';
  else
    v_reply:='ЗЛЫДЯ • ПОМОЩНИК СООБЩЕСТВА'||E'\n'||
    '━━━━━━━━━━━━━━━━'||E'\n'||
    'ПРОФИЛЬ И СОЦИАЛЬНОЕ'||E'\n'||
    '/me — моя анкета'||E'\n'||
    '/who UUID или @username — анкета участника'||E'\n'||'Кто ты @username — краткая форма анкеты'||E'\n'||
    '/bio текст — описание'||E'\n'||
    '/tag текст — тег'||E'\n'||
    '/privacy public|members|private — приватность'||E'\n'||
    '/rep [UUID] — репутация'||E'\n'||
    '/awards — награды'||E'\n'||
    '━━━━━━━━━━━━━━━━'||E'\n'||
    'СООБЩЕСТВО'||E'\n'||
    '/info — информация о группе'||E'\n'||
    '/rules — правила'||E'\n'||
    '/admins — администрация'||E'\n'||
    '/stats — статистика модерации'||E'\n'||
    '/top — рейтинг активности'||E'\n'||
    '/report UUID причина — жалоба'||E'\n'||
    '/poll вопрос | вариант 1 | вариант 2 — голосование'||E'\n'||
    '/vote ID номер — голос'||E'\n'||
    '/pollresults ID — результаты'||E'\n'||
    '━━━━━━━━━━━━━━━━'||E'\n'||
    'ЛИЧНЫЕ ИНСТРУМЕНТЫ'||E'\n'||
    '/balance — баланс жетонов'||E'\n'||
    '/pay UUID количество — перевод'||E'\n'||
    '/note название | текст — заметка'||E'\n'||
    '/notes — мои заметки'||E'\n'||
    '/bookmark UUID — сохранить сообщение'||E'\n'||
    '/bookmarks — закладки'||E'\n'||
    '━━━━━━━━━━━━━━━━'||E'\n';
  if v_rank>=4 then
    v_reply:=v_reply||'АДМИНИСТРИРОВАНИЕ'||E'\n'||
      '/warn UUID причина'||E'\n'||'/warnings [UUID]'||E'\n'||
      '/clearwarns UUID'||E'\n'||'/mute UUID минуты причина'||E'\n'||
      '/unmute UUID'||E'\n'||'/kick UUID'||E'\n'||
      '/ban UUID причина'||E'\n'||'/unban UUID'||E'\n'||
      '/rank UUID 1–4 название'||E'\n'||'/award UUID merit_1…merit_8 причина'||E'\n'||
      '/grant UUID количество причина'||E'\n'||'/antispam on|off'||E'\n'||
      '/setrules текст'||E'\n'||'/setwelcome текст'||E'\n'||
      '/command имя ответ'||E'\n'||'/delcommand имя'||E'\n';
  end if;
  end if;
  v_reply:=v_reply||E'\n'||'Примечание: бот не читает сообщения и не отвечает в переписках с обязательным E2E.';
  insert into public.chat_messages(conversation_id,sender_id,body,client_message_id)
  values(new.conversation_id,v_bot.bot_user_id,v_reply,'zladen-menu:'||new.id::text)
  on conflict(sender_id,client_message_id) do nothing;
  return new;
end $$;
revoke all on function private.rim_zladen_handle_menu_message() from public,anon,authenticated;
drop trigger if exists rim_zladen_handle_menu_message on public.chat_messages;
create trigger rim_zladen_handle_menu_message after insert on public.chat_messages
for each row execute function private.rim_zladen_handle_menu_message();

comment on function private.rim_zladen_group_bot_arrival() is 'Posts one onboarding message when Zladen is added to a non-E2E group.';
comment on function private.rim_zladen_handle_menu_message() is 'Serves /menu, /zladen and /возможности in groups without reading E2E messages.';
