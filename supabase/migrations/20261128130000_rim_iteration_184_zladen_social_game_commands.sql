alter table public.rim_zladen_game_events
  drop constraint if exists rim_zladen_game_events_game_key_check;
alter table public.rim_zladen_game_events
  add constraint rim_zladen_game_events_game_key_check
  check (game_key = any (array[
    'roll','golden_dice','random','choose','yesno','percent','who','pair',
    'pair_all','ping','say','social'
  ]::text[]));

CREATE OR REPLACE FUNCTION private.rim_zladen_handle_social_games()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_bot public.rim_system_bot_registry%rowtype;
  v_group public.conversations%rowtype;
  v_token text;
  v_command text;
  v_rest text;
  v_reply text;
  v_game text;
  v_sides integer;
  v_min bigint;
  v_max bigint;
  v_options text[];
  v_choice text;
  v_members uuid[];
  v_target uuid;
  v_lookup text;
  v_name text;
  v_name_two text;
  v_count bigint;
  v_lines text;
begin
  if new.sender_id is null or coalesce(new.body,'')='' then return new; end if;
  select * into v_bot from public.rim_system_bot_registry where bot_key='zladen' and is_active=true;
  if not found or v_bot.bot_user_id is null or new.sender_id=v_bot.bot_user_id then return new; end if;
  if not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=v_bot.bot_user_id) then return new; end if;
  select * into v_group from public.conversations where id=new.conversation_id;
  if not found or v_group.type<>'group' or coalesce(v_group.e2e_mode,'off') in ('pending','required') then return new; end if;
  if exists(select 1 from public.rim_system_bot_installs where user_id=new.sender_id and bot_key='zladen' and state in ('blocked','unsubscribed')) then return new; end if;

  v_token:=lower(split_part(btrim(new.body),' ',1));
  if v_token !~ '^[/!.]' then return new; end if;
  v_command:=regexp_replace(v_token,'^[/!.]','');
  v_command:=regexp_replace(v_command,'@'||coalesce(v_bot.username,'zladen_bot')||'$','');
  v_rest:=btrim(substr(btrim(new.body),length(split_part(btrim(new.body),' ',1))+1));

  if v_command in ('games','игры') then
    v_reply:='Мини-игры Злыди (без ставок и денежных призов):'||E'\n'||
      '/roll или /dice [число граней 2–1000] — бросить кубик'||E'\n'||
      '/golden_dice — бросить два золотых кубика'||E'\n'||
      '/random [от] [до] — случайное число'||E'\n'||
      '/choose вариант 1 | вариант 2 — выбрать вариант'||E'\n'||
      '/yesno вопрос — случайный игровой ответ'||E'\n'||
      '/percent текст — случайный процент, только ради развлечения'||E'\n'||
      '/who — выбрать участника'||E'\n'||
      '/pair — случайно объединить двух участников в команду'||E'\n'||
      '/pair_all — случайно выбрать пару участников'||E'\n'||
      '/ping — проверить, отвечает ли Злыдя'||E'\n'||
      '/game_stats и /game_top — статистика игр'||E'\n'||
      'Действия: /hug, /pat, /tea, /highfive, /handshake, /congrats, /praise, /apologize @username.';
    v_game:=null;

  elsif v_command in ('roll','dice','кубы','куб') then
    begin v_sides:=coalesce(nullif(split_part(v_rest,' ',1),''),'6')::integer; exception when others then v_sides:=0; end;
    if v_sides<2 or v_sides>1000 then v_reply:='Формат: /roll или /dice [число граней от 2 до 1000].';
    else v_reply:='🎲 Выпало: '||(floor(random()*v_sides)::integer+1)::text||' из '||v_sides::text||'.'; v_game:='roll'; end if;

  elsif v_command='golden_dice' then
    v_sides:=floor(random()*6)::integer+1;
    v_count:=floor(random()*6)::integer+1;
    v_reply:='✨ Золотые кубы: '||v_sides::text||' + '||v_count::text||' = '||(v_sides+v_count)::text||'.';
    v_game:='golden_dice';

  elsif v_command='random' then
    begin v_min:=coalesce(nullif(split_part(v_rest,' ',1),''),'1')::bigint; v_max:=coalesce(nullif(split_part(v_rest,' ',2),''),'100')::bigint; exception when others then v_min:=0; v_max:=-1; end;
    if v_min<0 or v_max<v_min or v_max>1000000 or v_max-v_min>1000000 then v_reply:='Формат: /random [от 0] [до 1000000].';
    else v_reply:='🎯 Случайное число: '||(v_min+floor(random()*(v_max-v_min+1))::bigint)::text; v_game:='random'; end if;

  elsif v_command='choose' then
    v_options:=string_to_array(v_rest,'|');
    if coalesce(array_length(v_options,1),0)<2 or array_length(v_options,1)>10 or exists(select 1 from unnest(v_options) as opt(value) where btrim(value)='') then v_reply:='Формат: /choose вариант 1 | вариант 2 (от 2 до 10 непустых вариантов).';
    else v_choice:=btrim(v_options[1+floor(random()*array_length(v_options,1))::integer]); v_reply:='🎯 Выбор Злыди: «'||left(v_choice,180)||'»'; v_game:='choose'; end if;

  elsif v_command='yesno' then
    v_options:=array['Да','Скорее да','Пока неясно','Скорее нет','Нет'];
    v_reply:='🎱 Игровой ответ: '||v_options[1+floor(random()*array_length(v_options,1))::integer]||'. Это случайная игра, не совет для важных решений.';
    v_game:='yesno';

  elsif v_command='percent' then
    v_reply:='🎲 Случайное значение: '||floor(random()*101)::integer::text||'%. Только развлекательный генератор, не прогноз.';
    if v_rest<>'' then v_reply:=left(v_reply||E'\n'||left(v_rest,120),300); end if;
    v_game:='percent';

  elsif v_command='who' then
    select array_agg(m.user_id order by random()) into v_members from public.conversation_members m where m.conversation_id=new.conversation_id and m.user_id<>v_bot.bot_user_id;
    if coalesce(array_length(v_members,1),0)=0 then v_reply:='В группе пока некого выбрать.';
    else select coalesce(p.display_name,p.username,'Участник') into v_name from public.profiles p where p.id=v_members[1]; v_reply:='🎯 Случайный участник: '||coalesce(v_name,'Участник')||'.'; v_game:='who'; end if;

  elsif v_command='pair' then
    select array_agg(m.user_id order by random()) into v_members from public.conversation_members m where m.conversation_id=new.conversation_id and m.user_id<>v_bot.bot_user_id;
    if coalesce(array_length(v_members,1),0)<2 then v_reply:='Для случайной команды нужны хотя бы два участника.';
    else
      select coalesce(p.display_name,p.username,'Участник') into v_name from public.profiles p where p.id=v_members[1];
      select coalesce(p.display_name,p.username,'Участник') into v_name_two from public.profiles p where p.id=v_members[2];
      v_reply:='🤝 Случайная команда: '||coalesce(v_name,'Участник')||' + '||coalesce(v_name_two,'Участник')||'.'; v_game:='pair';
    end if;

  elsif v_command='pair_all' then
    select array_agg(m.user_id order by random()) into v_members
    from public.conversation_members m
    where m.conversation_id=new.conversation_id and m.user_id<>v_bot.bot_user_id;
    if coalesce(array_length(v_members,1),0)<2 then
      v_reply:='Для пейринга нужны хотя бы два участника.';
    else
      select coalesce(p.display_name,p.username,'Участник') into v_name from public.profiles p where p.id=v_members[1];
      select coalesce(p.display_name,p.username,'Участник') into v_name_two from public.profiles p where p.id=v_members[2];
      v_reply:='💞 Случайный общий пейринг: '||coalesce(v_name,'Участник')||' + '||coalesce(v_name_two,'Участник')||'.';
      v_game:='pair_all';
    end if;

  elsif v_command='ping' then
    v_reply:='🏓 Понг! Злыдя на связи.';
    v_game:='ping';

  elsif v_command='say' then
    if length(v_rest) not between 1 and 1000 then v_reply:='Формат: /say текст (1–1000 символов).';
    else v_reply:='Злыдя передаёт сообщение:'||E'\n'||'«'||v_rest||'»'; v_game:='say'; end if;

  elsif v_command in ('highfive','handshake','congrats','praise','apologize','hug','pat','tea') then
    v_lookup:=regexp_replace(split_part(v_rest,' ',1),'^@','');
    begin v_target:=v_lookup::uuid; exception when others then select p.id into v_target from public.profiles p where lower(p.username)=lower(v_lookup) limit 1; end;
    if v_target is null or not exists(select 1 from public.conversation_members m where m.conversation_id=new.conversation_id and m.user_id=v_target) then v_reply:='Укажи участника группы: /'||v_command||' UUID или @username.';
    elsif v_target=new.sender_id then v_reply:='Выбери другого участника группы.';
    else
      select coalesce(p.display_name,p.username,'Участник') into v_name from public.profiles p where p.id=v_target;
      v_reply:=case v_command
        when 'highfive' then '🙌 Злыдя передаёт пять: '
        when 'handshake' then '🤝 Злыдя предлагает рукопожатие: '
        when 'congrats' then '🎉 Злыдя поздравляет: '
        when 'praise' then '⭐ Злыдя хвалит: '
        when 'hug' then '🤗 Злыдя обнимает: '
        when 'pat' then '🐾 Злыдя гладит по голове: '
        when 'tea' then '🍵 Злыдя приглашает на чай: '
        else '📝 Злыдя передаёт извинение: '
      end||coalesce(v_name,'Участник')||'.';
      v_game:='social';
    end if;

  elsif v_command='game_stats' then
    select count(*) into v_count from public.rim_zladen_game_events where conversation_id=new.conversation_id and user_id=new.sender_id;
    v_reply:='Твоя игровая активность в этой группе: '||v_count::text||' команд.';
    v_game:=null;

  elsif v_command='game_top' then
    select string_agg(rn::text||'. '||display_name||' — '||games::text,E'\n' order by rn) into v_lines
    from (select row_number() over(order by count(*) desc,min(e.created_at)) rn,coalesce(p.display_name,p.username,'Участник') display_name,count(*) games
      from public.rim_zladen_game_events e left join public.profiles p on p.id=e.user_id
      where e.conversation_id=new.conversation_id group by e.user_id,p.display_name,p.username order by count(*) desc limit 10) ranked;
    v_reply:='Топ игровой активности:'||E'\n'||coalesce(v_lines,'Пока нет результатов.');
    v_game:=null;
  else return new;
  end if;

  if v_game in ('roll','golden_dice','random','choose','yesno','percent','who','pair','pair_all','ping','social','say') then
    insert into public.rim_zladen_game_events(conversation_id,user_id,game_key) values(new.conversation_id,new.sender_id,v_game);
  end if;
  if v_reply is not null and v_reply<>'' then
    insert into public.chat_messages(conversation_id,sender_id,body,client_message_id)
    values(new.conversation_id,v_bot.bot_user_id,left(v_reply,3000),'zladen-social:'||new.id::text)
    on conflict(sender_id,client_message_id) do nothing;
    update public.conversations set last_message_at=now() where id=new.conversation_id;
  end if;
  return new;
end $function$
;

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
    when 'roll' then 'Бросает виртуальный кубик с заданным числом граней от 2 до 1000.'
    when 'dice' then 'Короткий псевдоним /roll: бросает виртуальный кубик.'
    when 'golden_dice' then 'Бросает два золотых шестигранных кубика и показывает сумму.'
    when 'random' then 'Выбирает случайное целое число в заданном диапазоне.'
    when 'choose' then 'Случайно выбирает один вариант из списка, разделённого символом |.'
    when 'yesno' then 'Даёт случайный игровой ответ: да, нет или промежуточный вариант.'
    when 'percent' then 'Генерирует случайный процент для развлекательной игры.'
    when 'pair' then 'Случайно выбирает двух участников и объединяет их в команду.'
    when 'pair_all' then 'Случайно выбирает пару участников группы для общего пейринга.'
    when 'say' then 'Повторяет переданный текст с подписью Злыди.'
    when 'ping' then 'Проверяет, отвечает ли Злыдя в этой группе.'
    when 'game_stats' then 'Показывает число игровых команд, использованных вами в группе.'
    when 'game_top' then 'Показывает десять самых активных участников по числу игровых команд.'
    when 'highfive' then 'Отправляет выбранному участнику игровое действие «дать пять».'
    when 'handshake' then 'Отправляет выбранному участнику игровое действие «рукопожатие».'
    when 'congrats' then 'Поздравляет выбранного участника группы.'
    when 'praise' then 'Отправляет выбранному участнику похвалу.'
    when 'apologize' then 'Передаёт выбранному участнику извинение.'
    when 'hug' then 'Отправляет выбранному участнику виртуальное дружеское объятие.'
    when 'pat' then 'Отправляет выбранному участнику дружеское поглаживание по голове.'
    when 'tea' then 'Приглашает выбранного участника на виртуальное чаепитие.'
    when 'buy' then 'Покупает предмет из магазина за внутреннюю валюту.'
    when 'market_sell' then 'Выставляет принадлежащий вам предмет на внутренний рынок.'
    when 'market_buy' then 'Покупает предмет с внутреннего рынка.'
    when 'market_cancel' then 'Снимает ваше объявление с внутреннего рынка.'
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
$function$
;
