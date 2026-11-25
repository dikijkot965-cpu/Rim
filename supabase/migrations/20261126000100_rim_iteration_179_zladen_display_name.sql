begin;

update public.rim_system_bot_registry
set display_name = 'Злыдень',
    updated_at = now()
where bot_key = 'zladen'
  and display_name is distinct from 'Злыдень';

update public.profiles
set display_name = 'Злыдень'
where id in (
  select bot_user_id from public.rim_system_bot_registry
  where bot_key = 'zladen' and bot_user_id is not null
);

update public.rim_bots
set display_name = 'Злыдень',
    updated_at = now()
where bot_user_id in (
  select bot_user_id from public.rim_system_bot_registry
  where bot_key = 'zladen' and bot_user_id is not null
);

create or replace function public.rim_zladen_install_for_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_bot public.rim_system_bot_registry%rowtype;
  v_install public.rim_system_bot_installs%rowtype;
  v_conversation uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'user_required' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'install_user_not_found' using errcode = 'P0002';
  end if;

  select * into v_bot
  from public.rim_system_bot_registry
  where bot_key = 'zladen' and is_active = true;

  if not found or v_bot.bot_user_id is null then
    raise exception 'zladen_not_provisioned' using errcode = 'P0001';
  end if;
  if p_user_id = v_bot.bot_user_id then
    raise exception 'invalid_install_user' using errcode = '22023';
  end if;

  select * into v_install
  from public.rim_system_bot_installs
  where user_id = p_user_id and bot_key = 'zladen';

  if found then
    if v_install.state <> 'active' then
      return jsonb_build_object(
        'installed', false,
        'state', v_install.state,
        'conversation_id', v_install.conversation_id,
        'bot_user_id', v_bot.bot_user_id
      );
    end if;
    if v_install.conversation_id is not null
       and exists (
         select 1 from public.conversation_members
         where conversation_id = v_install.conversation_id and user_id = p_user_id
       ) then
      return jsonb_build_object(
        'installed', true,
        'state', 'active',
        'conversation_id', v_install.conversation_id,
        'bot_user_id', v_bot.bot_user_id
      );
    end if;
  end if;

  insert into public.conversations(type, created_by, title, is_private)
  values ('direct', p_user_id, v_bot.display_name, true)
  returning id into v_conversation;

  insert into public.conversation_members(conversation_id, user_id)
  values (v_conversation, p_user_id), (v_conversation, v_bot.bot_user_id)
  on conflict do nothing;

  insert into public.chat_messages(conversation_id, sender_id, body, client_message_id)
  values (
    v_conversation,
    v_bot.bot_user_id,
    'Привет! Я Злыдень — системный помощник РИМа. Пока мои команды находятся в разработке. Напиши /help, чтобы увидеть доступные команды.',
    'zladen-welcome:' || p_user_id::text
  )
  on conflict(sender_id, client_message_id) do nothing;

  update public.conversations set last_message_at = now() where id = v_conversation;

  insert into public.rim_system_bot_installs(user_id, bot_key, conversation_id, state, installed_at, updated_at)
  values (p_user_id, 'zladen', v_conversation, 'active', now(), now())
  on conflict(user_id, bot_key)
  do update set conversation_id = excluded.conversation_id, state = 'active', updated_at = now();

  return jsonb_build_object(
    'installed', true,
    'state', 'active',
    'conversation_id', v_conversation,
    'bot_user_id', v_bot.bot_user_id,
    'username', v_bot.username,
    'display_name', v_bot.display_name
  );
end
$function$;

commit;
