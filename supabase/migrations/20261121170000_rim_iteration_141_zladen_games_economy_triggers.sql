-- RIM Iteration 141 — Zladen games, virtual commerce and executable safe triggers.
-- Additive. All currency is non-cash, non-withdrawable and non-wagering.
-- Bot handlers never inspect or respond in E2E-required conversations.

-- ---------------------------------------------------------------------------
-- 1. Economy: catalogue, inventory and public player market
-- ---------------------------------------------------------------------------
create table if not exists public.rim_zladen_item_catalog (
  item_key text primary key,
  title text not null,
  description text not null default '',
  base_price bigint not null check(base_price between 1 and 1000000000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check(item_key ~ '^[a-z0-9_]{2,32}$'),
  check(char_length(title) between 2 and 80),
  check(char_length(description)<=500)
);
insert into public.rim_zladen_item_catalog(item_key,title,description,base_price) values
 ('badge_bronze','Бронзовый знак','Косметический знак в профиле',50),
 ('badge_silver','Серебряный знак','Косметический знак в профиле',150),
 ('badge_gold','Золотой знак','Косметический знак в профиле',400),
 ('profile_frame','Рамка профиля','Декоративный предмет профиля',250),
 ('title_veteran','Титул «Ветеран»','Коллекционный титул участника',300),
 ('title_founder','Титул «Основатель»','Коллекционный титул сообщества',600)
on conflict(item_key) do nothing;

create table if not exists public.rim_zladen_inventory (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null references public.rim_zladen_item_catalog(item_key),
  quantity integer not null default 0 check(quantity between 0 and 1000000),
  updated_at timestamptz not null default now(),
  primary key(user_id,item_key)
);
create table if not exists public.rim_zladen_market_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null references public.rim_zladen_item_catalog(item_key),
  quantity integer not null check(quantity between 1 and 100000),
  unit_price bigint not null check(unit_price between 1 and 1000000000),
  status text not null default 'active' check(status in ('active','sold','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rim_zladen_market_active_idx on public.rim_zladen_market_listings(created_at desc) where status='active';

-- ---------------------------------------------------------------------------
-- 2. Non-wagering games: daily trivia and participation rewards
-- ---------------------------------------------------------------------------
create table if not exists public.rim_zladen_quiz_questions (
  id bigint generated always as identity primary key,
  question text not null,
  options jsonb not null,
  correct_option smallint not null,
  explanation text not null default '',
  is_active boolean not null default true,
  check(char_length(question) between 5 and 500),
  check(jsonb_typeof(options)='array' and jsonb_array_length(options) between 2 and 6),
  check(correct_option between 1 and 6),
  check(char_length(explanation)<=1000)
);
insert into public.rim_zladen_quiz_questions(question,options,correct_option,explanation) values
 ('Какой город был столицей Российской империи большую часть периода 1712–1918 годов?', '["Москва","Санкт-Петербург","Казань","Киев"]',2,'Санкт-Петербург был столицей с 1712 по 1918 год.'),
 ('В каком году произошло Ледовое побоище?', '["1242","1380","1480","1612"]',1,'Сражение на Чудском озере произошло в 1242 году.'),
 ('Кто автор «Повести временных лет» в традиционной атрибуции?', '["Нестор","Карамзин","Татищев","Ломоносов"]',1,'Традиция связывает составление начального летописного свода с Нестором, хотя вопрос авторства сложнее.'),
 ('Какой договор завершил Северную войну между Россией и Швецией?', '["Ништадтский","Тильзитский","Ясский","Парижский"]',1,'Ништадтский мир был заключён в 1721 году.'),
 ('Как называется наука о монетах?', '["Геральдика","Нумизматика","Сфрагистика","Палеография"]',2,'Нумизматика изучает монеты и денежное обращение.')
on conflict do nothing;

create table if not exists public.rim_zladen_quiz_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  day_key date not null,
  question_id bigint not null references public.rim_zladen_quiz_questions(id),
  answered_at timestamptz,
  is_correct boolean,
  reward_claimed boolean not null default false,
  created_at timestamptz not null default now(),
  primary key(user_id,day_key)
);
create table if not exists public.rim_zladen_trigger_claims (
  trigger_id uuid not null references public.rim_zladen_triggers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  day_key date not null,
  created_at timestamptz not null default now(),
  primary key(trigger_id,user_id,day_key)
);
create table if not exists public.rim_zladen_daily_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  day_key date not null,
  reward bigint not null check(reward between 1 and 10000),
  created_at timestamptz not null default now(),
  primary key(user_id,day_key)
);

-- ---------------------------------------------------------------------------
-- 3. Trigger engine: declarative, allowlisted conditions and actions only.
-- ---------------------------------------------------------------------------
alter table public.rim_zladen_triggers drop constraint if exists rim_zladen_triggers_action_type_check;
alter table public.rim_zladen_triggers add constraint rim_zladen_triggers_action_type_check
  check(action_type in ('warn','mute','notify_admins','audit','reply','grant_points'));

-- Keep existing tables private.
do $$ declare t text; begin
  foreach t in array array['rim_zladen_item_catalog','rim_zladen_inventory','rim_zladen_market_listings','rim_zladen_quiz_questions','rim_zladen_quiz_sessions','rim_zladen_daily_claims','rim_zladen_trigger_claims'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
  end loop;
end $$;

create or replace function private.rim_zladen_handle_games_economy_triggers()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare
  v_bot public.rim_system_bot_registry%rowtype;
  v_group public.conversations%rowtype;
  v_token text;
  v_command text;
  v_rest text;
  v_reply text;
  v_args text[];
  v_rank integer:=0;
  v_item text;
  v_qty integer;
  v_price bigint;
  v_amount bigint;
  v_balance bigint;
  v_target_balance bigint;
  v_listing uuid;
  v_listing_row public.rim_zladen_market_listings%rowtype;
  v_question public.rim_zladen_quiz_questions%rowtype;
  v_day date:=(now() at time zone 'utc')::date;
  v_choice integer;
  v_correct boolean;
  v_reward bigint;
  v_trigger record;
  v_match text;
  v_action_text text;
  v_action_points bigint;
  v_action_type text;
  v_action_config jsonb;
  v_reply_id uuid;
  v_rows integer;
begin
  if new.sender_id is null or coalesce(new.body,'')='' then return new; end if;
  select * into v_bot from public.rim_system_bot_registry where bot_key='zladen' and is_active=true;
  if not found or v_bot.bot_user_id is null or new.sender_id=v_bot.bot_user_id then return new; end if;
  select * into v_group from public.conversations where id=new.conversation_id;
  if not found or coalesce(v_group.e2e_mode,'off')='required' then return new; end if;
  if not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=v_bot.bot_user_id) then return new; end if;
  if exists(select 1 from public.rim_system_bot_installs where user_id=new.sender_id and bot_key='zladen' and state in ('blocked','unsubscribed')) then return new; end if;

  v_token:=lower(split_part(btrim(new.body),' ',1));
  if v_token !~ '^[/!.]' then v_command:=''; else v_command:=regexp_replace(v_token,'^[/!.]',''); end if;
  v_command:=regexp_replace(v_command,'@'||coalesce(v_bot.username,'zladen_bot')||'$','');
  v_rest:=btrim(substr(btrim(new.body),length(split_part(btrim(new.body),' ',1))+1));
  if v_group.created_by=new.sender_id then v_rank:=5;
  elsif exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=new.sender_id and role in ('owner','admin')) then v_rank:=4;
  else select coalesce(max(rank),0) into v_rank from public.rim_zladen_chat_roles where conversation_id=new.conversation_id and user_id=new.sender_id; end if;

  -- Player profile and first-use wallet are provisioned lazily.
  insert into public.rim_zladen_wallets(user_id) values(new.sender_id) on conflict do nothing;

  if v_command='daily' then
    v_reward:=25;
    insert into public.rim_zladen_daily_claims(user_id,day_key,reward) values(new.sender_id,v_day,v_reward) on conflict do nothing;
    get diagnostics v_rows=row_count;
    if v_rows=0 then v_reply:='Ежедневная награда уже получена. Возвращайся после смены дня UTC.';
    else
      update public.rim_zladen_wallets set balance=balance+v_reward,updated_at=now() where user_id=new.sender_id returning balance into v_balance;
      insert into public.rim_zladen_ledger(user_id,delta,balance_after,operation,operation_key,reason,conversation_id)
      values(new.sender_id,v_reward,v_balance,'grant','zladen-daily:'||new.sender_id::text||':'||v_day::text,'Ежедневная награда',new.conversation_id);
      v_reply:='Ежедневная награда: +'||v_reward::text||' жетонов. Баланс: '||v_balance::text||'.';
    end if;
  elsif v_command='quiz' then
    select * into v_question from public.rim_zladen_quiz_questions where is_active order by md5(id::text||v_day::text||new.sender_id::text) limit 1;
    if not found then v_reply:='Вопросы викторины пока не добавлены.';
    else
      insert into public.rim_zladen_quiz_sessions(user_id,day_key,question_id) values(new.sender_id,v_day,v_question.id) on conflict(user_id,day_key) do nothing;
      select q.* into v_question from public.rim_zladen_quiz_sessions s join public.rim_zladen_quiz_questions q on q.id=s.question_id where s.user_id=new.sender_id and s.day_key=v_day;
      select string_agg((o.ordinality::text||'. '||o.option_text),E'\n' order by o.ordinality) into v_action_text
      from jsonb_array_elements_text(v_question.options) with ordinality as o(option_text,ordinality);
      v_reply:='Викторина дня:'||E'\n'||v_question.question||E'\n'||v_action_text||E'\nОтвет: /answer номер. За правильный ответ — 20 жетонов. Попытка одна в день.';
    end if;
  elsif v_command='answer' then
    begin v_choice:=split_part(v_rest,' ',1)::integer; exception when others then v_choice:=null; end;
    select q.* into v_question from public.rim_zladen_quiz_sessions s join public.rim_zladen_quiz_questions q on q.id=s.question_id where s.user_id=new.sender_id and s.day_key=v_day;
    if not found then v_reply:='Сначала получи вопрос командой /quiz.';
    else
      update public.rim_zladen_quiz_sessions set answered_at=now(),is_correct=(v_choice=q.correct_option)
      from public.rim_zladen_quiz_questions q
      where public.rim_zladen_quiz_sessions.question_id=q.id and user_id=new.sender_id and day_key=v_day and answered_at is null and v_choice between 1 and jsonb_array_length(q.options);
      get diagnostics v_rows=row_count;
      if v_rows=0 then
        if exists(select 1 from public.rim_zladen_quiz_sessions where user_id=new.sender_id and day_key=v_day and answered_at is not null) then v_reply:='Сегодняшняя попытка уже использована. Новая викторина будет доступна завтра.';
        else v_reply:='Укажи номер варианта из списка.'; end if;
      else
        select is_correct into v_correct from public.rim_zladen_quiz_sessions where user_id=new.sender_id and day_key=v_day;
        if v_correct then
          update public.rim_zladen_wallets set balance=balance+20,updated_at=now() where user_id=new.sender_id returning balance into v_balance;
          insert into public.rim_zladen_ledger(user_id,delta,balance_after,operation,operation_key,reason,conversation_id)
          values(new.sender_id,20,v_balance,'grant','zladen-quiz:'||new.sender_id::text||':'||v_day::text,'Награда за викторину',new.conversation_id);
          v_reply:='Верно! +20 жетонов. Баланс: '||v_balance::text||E'\n'||coalesce(v_question.explanation,'');
        else v_reply:='Неверно. Попытка на сегодня использована. '||coalesce(v_question.explanation,''); end if;
      end if;
    end if;
  elsif v_command='shop' then
    select string_agg(item_key||' — '||title||' ('||base_price::text||' жет.)'||case when description<>'' then ' · '||description else '' end,E'\n' order by base_price)
    into v_reply from public.rim_zladen_item_catalog where is_active;
    v_reply:='Магазин Злыди:'||E'\n'||coalesce(v_reply,'Каталог пуст.')||E'\nПокупка: /buy ключ [количество].';
  elsif v_command='buy' then
    v_args:=regexp_split_to_array(v_rest,'\s+'); v_item:=lower(coalesce(v_args[1],''));
    begin v_qty:=coalesce(nullif(v_args[2],''),'1')::integer; exception when others then v_qty:=0; end;
    select base_price into v_price from public.rim_zladen_item_catalog where item_key=v_item and is_active;
    if not found or v_qty<1 or v_qty>100 then v_reply:='Формат: /buy ключ [количество]. Список предметов: /shop.';
    elsif v_price>9000000000000000/v_qty then v_reply:='Слишком большая сумма.';
    else
      v_amount:=v_price*v_qty;
      update public.rim_zladen_wallets set balance=balance-v_amount,updated_at=now() where user_id=new.sender_id and balance>=v_amount returning balance into v_balance;
      if not found then v_reply:='Недостаточно жетонов. Посмотри баланс: /balance.';
      else
        insert into public.rim_zladen_inventory(user_id,item_key,quantity) values(new.sender_id,v_item,v_qty)
        on conflict(user_id,item_key) do update set quantity=public.rim_zladen_inventory.quantity+excluded.quantity,updated_at=now();
        insert into public.rim_zladen_ledger(user_id,delta,balance_after,operation,operation_key,reason,conversation_id)
        values(new.sender_id,-v_amount,v_balance,'purchase','zladen-shop:'||new.id::text,'Покупка: '||v_item||' × '||v_qty::text,new.conversation_id);
        v_reply:='Покупка завершена: '||v_item||' × '||v_qty::text||'. Потрачено: '||v_amount::text||' жетонов. Остаток: '||v_balance::text||'.';
      end if;
    end if;
  elsif v_command='inventory' or v_command='inv' then
    select string_agg(c.title||' × '||i.quantity::text,' · ' order by c.title) into v_reply
    from public.rim_zladen_inventory i join public.rim_zladen_item_catalog c using(item_key) where i.user_id=new.sender_id and i.quantity>0;
    v_reply:='Инвентарь:'||E'\n'||coalesce(v_reply,'Пока пуст. Загляни в /shop.');
  elsif v_command='market' then
    select string_agg(id::text||' · '||c.title||' × '||quantity::text||' · '||unit_price::text||' жет./шт. · продавец '||left(seller_id::text,8),E'\n' order by created_at desc)
    into v_reply from (select * from public.rim_zladen_market_listings where status='active' order by created_at desc limit 12) m join public.rim_zladen_item_catalog c using(item_key);
    v_reply:='Рынок участников:'||E'\n'||coalesce(v_reply,'Активных объявлений нет.')||E'\nКупить: /market_buy ID_объявления количество.';
  elsif v_command='market_sell' then
    v_args:=regexp_split_to_array(v_rest,'\s+'); v_item:=lower(coalesce(v_args[1],''));
    begin v_qty:=coalesce(nullif(v_args[2],''),'0')::integer; v_price:=coalesce(nullif(v_args[3],''),'0')::bigint; exception when others then v_qty:=0; v_price:=0; end;
    if v_qty<1 or v_qty>100000 or v_price<1 or v_price>1000000000 or not exists(select 1 from public.rim_zladen_item_catalog where item_key=v_item and is_active) then v_reply:='Формат: /market_sell ключ количество цена_за_штуку. Предмет должен быть в инвентаре.';
    else
      update public.rim_zladen_inventory set quantity=quantity-v_qty,updated_at=now() where user_id=new.sender_id and item_key=v_item and quantity>=v_qty;
      if not found then v_reply:='В инвентаре недостаточно предметов.';
      else
        insert into public.rim_zladen_market_listings(seller_id,item_key,quantity,unit_price) values(new.sender_id,v_item,v_qty,v_price) returning id into v_listing;
        v_reply:='Объявление создано. ID: '||v_listing::text||E'\nЦена за штуку: '||v_price::text||' жетонов. Просмотр: /market.';
      end if;
    end if;
  elsif v_command='market_buy' then
    v_args:=regexp_split_to_array(v_rest,'\s+');
    begin v_listing:=v_args[1]::uuid; v_qty:=coalesce(nullif(v_args[2],''),'1')::integer; exception when others then v_listing:=null; v_qty:=0; end;
    if v_listing is null or v_qty<1 or v_qty>100000 then v_reply:='Формат: /market_buy UUID_объявления [количество].';
    else
      select * into v_listing_row from public.rim_zladen_market_listings where id=v_listing and status='active' for update;
      if not found or v_listing_row.quantity<v_qty or v_listing_row.seller_id=new.sender_id then v_reply:='Объявление недоступно, количества не хватает или нельзя купить собственный лот.';
      elsif v_listing_row.unit_price>9000000000000000/v_qty then v_reply:='Сумма слишком велика.';
      else
        v_amount:=v_listing_row.unit_price*v_qty;
        insert into public.rim_zladen_wallets(user_id) values(v_listing_row.seller_id) on conflict do nothing;
        update public.rim_zladen_wallets set balance=balance-v_amount,updated_at=now() where user_id=new.sender_id and balance>=v_amount returning balance into v_balance;
        if not found then v_reply:='Недостаточно жетонов.';
        else
          update public.rim_zladen_wallets set balance=balance+v_amount,updated_at=now() where user_id=v_listing_row.seller_id returning balance into v_target_balance;
          insert into public.rim_zladen_inventory(user_id,item_key,quantity) values(new.sender_id,v_listing_row.item_key,v_qty)
          on conflict(user_id,item_key) do update set quantity=public.rim_zladen_inventory.quantity+excluded.quantity,updated_at=now();
          update public.rim_zladen_market_listings set quantity=quantity-v_qty,status=case when quantity-v_qty=0 then 'sold' else 'active' end,updated_at=now() where id=v_listing;
          insert into public.rim_zladen_ledger(user_id,delta,balance_after,operation,operation_key,counterparty_id,reason,conversation_id)
          values(new.sender_id,-v_amount,v_balance,'purchase','zladen-market:'||new.id::text||':buyer',v_listing_row.seller_id,'Покупка на рынке',new.conversation_id),
                (v_listing_row.seller_id,v_amount,v_target_balance,'grant','zladen-market:'||new.id::text||':seller',new.sender_id,'Продажа на рынке',new.conversation_id);
          v_reply:='Покупка на рынке завершена. Получено: '||v_listing_row.item_key||' × '||v_qty::text||'. Списано: '||v_amount::text||' жетонов.';
        end if;
      end if;
    end if;
  elsif v_command='market_cancel' then
    begin v_listing:=split_part(v_rest,' ',1)::uuid; exception when others then v_listing:=null; end;
    select * into v_listing_row from public.rim_zladen_market_listings where id=v_listing and seller_id=new.sender_id and status='active' for update;
    if not found then v_reply:='Активное объявление не найдено.';
    else
      update public.rim_zladen_market_listings set status='cancelled',updated_at=now() where id=v_listing;
      insert into public.rim_zladen_inventory(user_id,item_key,quantity) values(new.sender_id,v_listing_row.item_key,v_listing_row.quantity)
      on conflict(user_id,item_key) do update set quantity=public.rim_zladen_inventory.quantity+excluded.quantity,updated_at=now();
      v_reply:='Объявление снято. Предметы возвращены в инвентарь.';
    end if;
  elsif v_command='economy_top' then
    select string_agg(rn::text||'. '||left(user_id::text,8)||' — '||balance::text||' жет.',E'\n' order by rn) into v_reply
    from (select row_number() over(order by balance desc,updated_at asc) rn,user_id,balance from public.rim_zladen_wallets order by balance desc limit 10) t;
    v_reply:='Топ балансов:'||E'\n'||coalesce(v_reply,'Пока пусто.');
  elsif v_command='trigger' and v_group.type='group' then
    if v_rank<4 then v_reply:='Настраивать триггеры могут только администраторы.';
    elsif lower(split_part(v_rest,' ',1))='list' then
      select string_agg(left(id::text,8)||' · '||name||' · '||event_type||' · '||action_type||' · '||case when is_enabled then 'вкл.' else 'выкл.' end,E'\n' order by priority,id)
      into v_reply from public.rim_zladen_triggers where conversation_id=new.conversation_id;
      v_reply:='Триггеры группы:'||E'\n'||coalesce(v_reply,'Пока нет триггеров. Добавить: /trigger add название | contains:текст | reply:ответ');
    elsif lower(split_part(v_rest,' ',1))='add' then
      v_args:=string_to_array(btrim(substr(v_rest,5)),'|');
      if coalesce(array_length(v_args,1),0)<>3 or btrim(v_args[1])='' or length(btrim(v_args[2]))<9 then
        v_reply:='Формат: /trigger add название | contains:фраза | reply:текст ИЛИ grant:число. Триггер реагирует на новые сообщения.';
      else
        v_match:=btrim(v_args[2]);
        if split_part(v_match,':',1) not in ('contains','starts_with','equals') or strpos(v_match,':')=0 then v_reply:='Условие: contains:фраза, starts_with:начало или equals:текст.';
        elsif length(btrim(substr(v_match,strpos(v_match,':')+1)))<2 then v_reply:='Условие должно содержать не менее двух символов.';
        else
          if left(btrim(v_args[3]),6)='reply:' and length(btrim(substr(v_args[3],7)))>0 then
            v_action_type:='reply'; v_action_config:=jsonb_build_object('text',left(btrim(substr(v_args[3],7)),1000));
          elsif left(btrim(v_args[3]),6)='grant:' then
            begin v_action_points:=greatest(1,least(1000,substr(btrim(v_args[3]),7)::bigint)); exception when others then v_action_points:=0; end;
            if v_action_points<1 then v_reply:='Награда должна быть числом от 1 до 1000 жетонов.'; end if;
            v_action_type:='grant_points'; v_action_config:=jsonb_build_object('points',v_action_points);
          else v_reply:='Действие: reply:текст или grant:число (1–1000 жетонов).'; end if;
          if v_reply is null then
            insert into public.rim_zladen_triggers(conversation_id,name,event_type,condition,action_type,action_config,created_by)
            values(new.conversation_id,left(btrim(v_args[1]),80),'message',jsonb_build_object('match',split_part(v_match,':',1),'value',left(btrim(substr(v_match,strpos(v_match,':')+1)),160)),v_action_type,v_action_config,new.sender_id);
            v_reply:='Триггер создан. Посмотреть: /trigger list. Он будет реагировать на новые сообщения, кроме команд самого бота.';
          end if;
        end if;
      end if;
    elsif lower(split_part(v_rest,' ',1))='join_add' then
      v_args:=string_to_array(btrim(substr(v_rest,9)),'|');
      if coalesce(array_length(v_args,1),0)<>2 or btrim(v_args[1])='' or left(btrim(v_args[2]),6)<>'reply:' or length(btrim(substr(v_args[2],7)))=0 then
        v_reply:='Формат: /trigger join_add название | reply:приветствие. Триггер сработает при вступлении нового участника.';
      else
        insert into public.rim_zladen_triggers(conversation_id,name,event_type,condition,action_type,action_config,created_by)
        values(new.conversation_id,left(btrim(v_args[1]),80),'join','{}'::jsonb,'reply',jsonb_build_object('text',left(btrim(substr(v_args[2],7)),1000)),new.sender_id);
        v_reply:='Триггер вступления создан.';
      end if;
    elsif lower(split_part(v_rest,' ',1))='del' then
      if split_part(v_rest,' ',2) !~ '^[0-9a-fA-F]{8,32}$' then v_reply:='Укажи первые 8–32 шестнадцатеричных символа ID из /trigger list.';
      else
        select count(*) into v_rows from public.rim_zladen_triggers where conversation_id=new.conversation_id and id::text like lower(split_part(v_rest,' ',2))||'%';
        if v_rows=1 then
          delete from public.rim_zladen_triggers where conversation_id=new.conversation_id and id::text like lower(split_part(v_rest,' ',2))||'%';
          v_reply:='Триггер удалён.';
        elsif v_rows>1 then v_reply:='Префикс неоднозначен. Укажи больше символов ID.';
        else v_reply:='Триггер с таким ID-префиксом не найден.'; end if;
      end if;
    else v_reply:='Управление: /trigger list; /trigger add название | contains:фраза | reply:ответ; /trigger del ID.';
    end if;
  end if;

  -- Execute message triggers only for ordinary messages, never bot output or commands.
  if v_command='' and v_group.type='group' then
    for v_trigger in select * from public.rim_zladen_triggers where conversation_id=new.conversation_id and event_type='message' and is_enabled order by priority,id limit 3 loop
      v_match:=coalesce(v_trigger.condition->>'match','');
      v_action_text:=coalesce(v_trigger.condition->>'value','');
      if v_action_text<>'' and (
        (v_match='contains' and position(lower(v_action_text) in lower(new.body))>0) or
        (v_match='starts_with' and left(lower(new.body),length(v_action_text))=lower(v_action_text)) or
        (v_match='equals' and lower(btrim(new.body))=lower(v_action_text))
      ) then
        if v_trigger.action_type='reply' then
          insert into public.chat_messages(conversation_id,sender_id,body,client_message_id)
          values(new.conversation_id,v_bot.bot_user_id,left(coalesce(v_trigger.action_config->>'text',''),4000),'zladen-trigger:'||v_trigger.id::text||':'||new.id::text)
          on conflict(sender_id,client_message_id) do nothing returning id into v_reply_id;
          insert into public.rim_zladen_trigger_logs(trigger_id,conversation_id,actor_id,action_type,result,details)
          values(v_trigger.id,new.conversation_id,new.sender_id,'reply',case when v_reply_id is null then 'duplicate' else 'executed' end,jsonb_build_object('message_id',new.id));
        elsif v_trigger.action_type='grant_points' then
          v_rows:=0;
          begin v_action_points:=greatest(0,least(1000,(v_trigger.action_config->>'points')::bigint)); exception when others then v_action_points:=0; end;
          if v_action_points>0 then
            insert into public.rim_zladen_trigger_claims(trigger_id,user_id,day_key) values(v_trigger.id,new.sender_id,v_day) on conflict do nothing;
            get diagnostics v_rows=row_count;
            if v_rows>0 then
              update public.rim_zladen_wallets set balance=balance+v_action_points,updated_at=now() where user_id=new.sender_id returning balance into v_balance;
              insert into public.rim_zladen_ledger(user_id,delta,balance_after,operation,operation_key,reason,conversation_id)
              values(new.sender_id,v_action_points,v_balance,'grant','zladen-trigger:'||v_trigger.id::text||':'||new.sender_id::text||':'||v_day::text,'Награда по триггеру: '||v_trigger.name,new.conversation_id);
            end if;
          end if;
          insert into public.rim_zladen_trigger_logs(trigger_id,conversation_id,actor_id,action_type,result,details)
          values(v_trigger.id,new.conversation_id,new.sender_id,'grant_points',case when v_rows>0 then 'executed' else 'daily_limit' end,jsonb_build_object('points',v_action_points));
        else
          insert into public.rim_zladen_trigger_logs(trigger_id,conversation_id,actor_id,action_type,result,details)
          values(v_trigger.id,new.conversation_id,new.sender_id,v_trigger.action_type,'matched',jsonb_build_object('message_id',new.id));
        end if;
      end if;
    end loop;
  end if;

  if v_reply is not null and v_reply<>'' then
    insert into public.chat_messages(conversation_id,sender_id,body,client_message_id)
    values(new.conversation_id,v_bot.bot_user_id,left(v_reply,4000),'zladen-game-economy:'||new.id::text)
    on conflict(sender_id,client_message_id) do nothing;
    update public.conversations set last_message_at=now() where id=new.conversation_id;
  end if;
  return new;
end $$;
revoke all on function private.rim_zladen_handle_games_economy_triggers() from public,anon,authenticated;
drop trigger if exists rim_zladen_handle_games_economy_triggers on public.chat_messages;
create trigger rim_zladen_handle_games_economy_triggers after insert on public.chat_messages
for each row execute function private.rim_zladen_handle_games_economy_triggers();

-- Join-event trigger executor: reacts to a real membership insertion.
create or replace function private.rim_zladen_handle_member_join_triggers()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare
  v_group public.conversations%rowtype;
  v_bot public.rim_system_bot_registry%rowtype;
  v_trigger record;
  v_text text;
begin
  select * into v_group from public.conversations where id=new.conversation_id;
  if not found or v_group.type<>'group' or coalesce(v_group.e2e_mode,'off')='required' then return new; end if;
  select * into v_bot from public.rim_system_bot_registry where bot_key='zladen' and is_active=true;
  if not found or v_bot.bot_user_id is null or new.user_id=v_bot.bot_user_id then return new; end if;
  if not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=v_bot.bot_user_id) then return new; end if;
  for v_trigger in select * from public.rim_zladen_triggers where conversation_id=new.conversation_id and event_type='join' and is_enabled order by priority,id limit 3 loop
    if v_trigger.action_type='reply' then
      v_text:=coalesce(v_trigger.action_config->>'text','');
      v_text:=replace(v_text,'{user_id}',new.user_id::text);
      v_text:=replace(v_text,'{conversation_id}',new.conversation_id::text);
      insert into public.chat_messages(conversation_id,sender_id,body,client_message_id)
      values(new.conversation_id,v_bot.bot_user_id,left(v_text,4000),'zladen-join-trigger:'||v_trigger.id::text||':'||new.user_id::text||':'||txid_current()::text)
      on conflict(sender_id,client_message_id) do nothing;
      insert into public.rim_zladen_trigger_logs(trigger_id,conversation_id,actor_id,action_type,result,details)
      values(v_trigger.id,new.conversation_id,new.user_id,'reply','executed',jsonb_build_object('event','join'));
    end if;
  end loop;
  return new;
end $$;
revoke all on function private.rim_zladen_handle_member_join_triggers() from public,anon,authenticated;
drop trigger if exists rim_zladen_member_join_triggers on public.conversation_members;
create trigger rim_zladen_member_join_triggers after insert on public.conversation_members
for each row execute function private.rim_zladen_handle_member_join_triggers();

comment on table public.rim_zladen_triggers is 'Safe declarative automation for messages and member joins; no arbitrary code execution.';
comment on table public.rim_zladen_market_listings is 'Player-to-player listings for internal non-cash points; no real-money value or withdrawal.';
comment on table public.rim_zladen_trigger_claims is 'One reward per user, trigger and UTC day prevents phrase-trigger farming.';
comment on table public.rim_zladen_quiz_sessions is 'Daily trivia attempts; rewards are fixed participation/knowledge points, never wagered.';
comment on table public.rim_zladen_triggers is 'Safe declarative group automation. Only allowlisted match conditions and actions execute; no arbitrary code.';
