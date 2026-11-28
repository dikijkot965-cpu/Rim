CREATE OR REPLACE FUNCTION private.rim_zladen_help_detail()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_bot_id uuid;
  v_type text;
  v_e2e_mode text;
  v_is_secret boolean;
  v_token text;
  v_rest text;
  v_command text;
  v_description text;
  v_custom text;
begin
  if new.sender_id is null or nullif(btrim(coalesce(new.body, '')), '') is null then
    return new;
  end if;

  select bot_user_id into v_bot_id
  from public.rim_system_bot_registry
  where bot_key = 'zladen' and is_active = true
  limit 1;

  if v_bot_id is null or new.sender_id = v_bot_id then
    return new;
  end if;

  select type, e2e_mode, is_secret into v_type, v_e2e_mode, v_is_secret
  from public.conversations
  where id = new.conversation_id;

  if not found or v_is_secret is true or v_type not in ('direct', 'group')
     or coalesce(v_e2e_mode, 'off') in ('pending', 'required') then
    return new;
  end if;

  if not exists (
    select 1 from public.conversation_members
    where conversation_id = new.conversation_id and user_id = v_bot_id
  ) then
    return new;
  end if;

  v_token := regexp_replace(lower(split_part(btrim(new.body), ' ', 1)), '@[^ ]+$', '');
  if v_token <> '/help' then
    return new;
  end if;

  v_rest := btrim(substr(btrim(new.body), length(split_part(btrim(new.body), ' ', 1)) + 1));
  v_command := lower(split_part(v_rest, ' ', 1));
  v_command := regexp_replace(v_command, '^[/!.]', '');
  v_command := regexp_replace(v_command, '@[^ ]+$', '');

  -- Bare /help remains handled by the existing menu dispatcher.
  if v_command = '' then
    return new;
  end if;

  v_description := case v_command
    when 'start' then 'Запускает Злыдю и показывает начальную справку.'
    when 'menu' then 'Показывает меню доступных команд с учётом типа чата и прав.'
    when 'commands' then 'Выводит список команд, доступных в этой переписке.'
    when 'ping' then 'Проверяет, отвечает ли Злыдя.'
    when 'id' then 'Показывает ID переписки и ваш RIM ID.'
    when 'info' then 'Показывает название группы и число участников.'
    when 'me' then 'Показывает вашу карточку участника и статистику.'
    when 'who' then 'Показывает карточку участника по его UUID.'
    when 'privacy' then 'Настраивает видимость профиля: public, members или private.'
    when 'bio' then 'Устанавливает краткое описание вашего профиля Злыди.'
    when 'tag' then 'Устанавливает пользовательскую метку профиля.'
    when 'rules' then 'Показывает правила текущей группы.'
    when 'setrules' then 'Задаёт текст правил группы. Только владелец или администратор.'
    when 'setwelcome' then 'Настраивает приветствие новых участников группы.'
    when 'admins' then 'Показывает владельца и администраторов группы.'
    when 'stats' then 'Показывает агрегированную статистику активности группы.'
    when 'balance' then 'Показывает ваш текущий баланс внутренних жетонов.'
    when 'daily' then 'Получает ежедневную награду, если она ещё не получена сегодня.'
    when 'pay' then 'Переводит внутренние жетоны другому участнику по правилам экономики.'
    when 'grant' then 'Начисляет жетоны участнику. Доступно администраторам.'
    when 'shop' then 'Показывает каталог предметов, доступных за внутренние жетоны.'
    when 'inventory' then 'Показывает предметы, которыми вы владеете.'
    when 'market' then 'Показывает объявления внутреннего рынка предметов.'
    when 'economy_top' then 'Показывает таблицу лидеров по внутреннему балансу.'
    when 'quiz' then 'Запускает викторину в текущем чате.'
    when 'answer' then 'Отправляет ответ на активный вопрос викторины.'
    when 'poll' then 'Создаёт опрос с вариантами ответа.'
    when 'vote' then 'Голосует в указанном опросе.'
    when 'pollresults' then 'Показывает результаты опроса.'
    when 'pollclose' then 'Закрывает опрос и завершает голосование.'
    when 'rep' then 'Показывает репутацию участника или сведения о ней.'
    when 'top' then 'Показывает рейтинг участников по репутации.'
    when 'award' then 'Выдаёт участнику одну из предусмотренных наград. Доступно администраторам.'
    when 'awards' then 'Показывает список ваших наград.'
    when 'note' then 'Сохраняет личную или групповую заметку.'
    when 'notes' then 'Показывает сохранённые заметки.'
    when 'bookmark' then 'Сохраняет сообщение в закладки по UUID.'
    when 'bookmarks' then 'Показывает ваши закладки.'
    when 'unbookmark' then 'Удаляет сообщение из ваших закладок.'
    when 'report' then 'Отправляет жалобу на участника или сообщение.'
    when 'reports' then 'Показывает очередь жалоб для модераторов.'
    when 'reportresolve' then 'Отмечает выбранную жалобу как рассмотренную.'
    when 'warn' then 'Выдаёт участнику предупреждение. Только администраторам.'
    when 'warnings' then 'Показывает активные предупреждения участника.'
    when 'clearwarns' then 'Снимает предупреждения участника. Только администраторам.'
    when 'mute' then 'Временно ограничивает отправку сообщений участнику.'
    when 'unmute' then 'Снимает ограничение на отправку сообщений.'
    when 'kick' then 'Удаляет участника из группы.'
    when 'ban' then 'Запрещает участнику возвращаться в группу.'
    when 'unban' then 'Снимает запрет на вход в группу.'
    when 'rank' then 'Назначает участнику ранг или роль.'
    when 'antispam' then 'Включает или отключает антиспам-защиту группы.'
    when 'filter' then 'Показывает и настраивает фильтры сообщений и ссылок.'
    when 'trigger' then 'Создаёт, просматривает и удаляет автоматические триггеры.'
    when 'remind' then 'Создаёт напоминание для этого чата.'
    when 'clan' then 'Показывает или управляет кланом и его участниками.'
    when 'alias' then 'Создаёт короткий псевдоним для существующей команды.'
    when 'aliases' then 'Показывает псевдонимы команд этой группы.'
    when 'command' then 'Создаёт или обновляет пользовательскую текстовую команду группы.'
    when 'delcommand' then 'Удаляет пользовательскую команду группы.'
    else null
  end;

  if v_description is null then
    select response into v_custom
    from public.rim_zladen_custom_commands
    where conversation_id = new.conversation_id and command = v_command
    limit 1;

    if found then
      v_description := 'Пользовательская команда группы. При вызове отправляет заранее сохранённый ответ администратора.';
    else
      select command into v_custom
      from public.rim_zladen_command_aliases
      where conversation_id = new.conversation_id and alias = v_command
      limit 1;

      if found then
        v_description := 'Псевдоним команды. При вызове выполняет /' || v_custom || '.';
      else
        v_description := 'Описание не найдено. Проверьте написание команды или отправьте /help, чтобы увидеть список доступных команд.';
      end if;
    end if;
  end if;

  insert into public.chat_messages(conversation_id, sender_id, body, client_message_id)
  values (
    new.conversation_id,
    v_bot_id,
    left('СПРАВКА /' || v_command || E'\n' || v_description, 4000),
    'zladen-help-detail:' || new.id::text
  )
  on conflict(sender_id, client_message_id) do nothing;

  return null;
end;
$function$;
revoke all on function private.rim_zladen_help_detail() from public, anon, authenticated;
comment on function private.rim_zladen_help_detail() is 'Answers /help command details for non-E2E and non-secret RIM conversations; returns the original command without storing it.';
