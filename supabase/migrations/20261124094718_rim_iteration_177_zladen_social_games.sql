-- Iteration 177: safe social mini-games and neutral group interactions for Zladen.
-- No wagering, cash, stakes, romantic roleplay, or E2E changes.
create table if not exists public.rim_zladen_game_events (
 id bigint generated always as identity primary key, conversation_id uuid not null references public.conversations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 game_key text not null check(game_key in ('roll','random','choose','yesno','percent','who','pair','say','social')),
 created_at timestamptz not null default now()
);
create index if not exists rim_zladen_game_events_chat_recent_idx on public.rim_zladen_game_events(conversation_id,created_at desc);
create index if not exists rim_zladen_game_events_user_idx on public.rim_zladen_game_events(conversation_id,user_id,created_at desc);
alter table public.rim_zladen_game_events enable row level security;
revoke all on public.rim_zladen_game_events from public,anon,authenticated;

create or replace function private.rim_zladen_handle_social_games()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare v_bot public.rim_system_bot_registry%rowtype; v_group public.conversations%rowtype; v_token text; v_command text; v_rest text; v_reply text; v_game text; v_sides integer; v_min bigint; v_max bigint; v_options text[]; v_choice text; v_members uuid[]; v_target uuid; v_lookup text; v_name text; v_name_two text; v_count bigint; v_lines text;
begin
 if new.sender_id is null or coalesce(new.body,'')='' then return new; end if;
 select * into v_bot from public.rim_system_bot_registry where bot_key='zladen' and is_active=true;
 if not found or v_bot.bot_user_id is null or new.sender_id=v_bot.bot_user_id then return new; end if;
 if not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=v_bot.bot_user_id) then return new; end if;
 select * into v_group from public.conversations where id=new.conversation_id;
 if not found or v_group.type<>'group' or coalesce(v_group.e2e_mode,'off') in ('pending','required') then return new; end if;
 if exists(select 1 from public.rim_system_bot_installs where user_id=new.sender_id and bot_key='zladen' and state in ('blocked','unsubscribed')) then return new; end if;
 v_token:=lower(split_part(btrim(new.body),' ',1)); if v_token !~ '^[/!.]' then return new; end if;
 v_command:=regexp_replace(v_token,'^[/!.]',''); v_command:=regexp_replace(v_command,'@'||coalesce(v_bot.username,'zladen_bot')||'$','');
 v_rest:=btrim(substr(btrim(new.body),length(split_part(btrim(new.body),' ',1))+1));
 if v_command in ('games','игры') then
  v_reply:='Мини-игры Злыди (без ставок и денежных призов):'||E'\n'||'/roll [число граней 2–1000] — бросить кубик'||E'\n'||'/random [от] [до] — случайное число'||E'\n'||'/choose вариант 1 | вариант 2 — выбрать вариант'||E'\n'||'/yesno вопрос — случайный игровой ответ'||E'\n'||'/percent текст — случайный процент, только ради развлечения'||E'\n'||'/who — выбрать участника'||E'\n'||'/pair — случайно объединить двух участников в команду'||E'\n'||'/game_stats и /game_top — статистика игр'||E'\n'||'Нейтральные действия: /highfive UUID, /handshake UUID, /congrats UUID, /praise UUID, /apologize UUID.';
 elsif v_command='roll' then
  begin v_sides:=coalesce(nullif(split_part(v_rest,' ',1),''),'6')::integer; exception when others then v_sides:=0; end;
  if v_sides<2 or v_sides>1000 then v_reply:='Формат: /roll [число граней от 2 до 1000].'; else v_reply:='🎲 Выпало: '||(floor(random()*v_sides)::integer+1)::text||' из '||v_sides::text||'.'; v_game:='roll'; end if;
 elsif v_command='random' then
  begin v_min:=coalesce(nullif(split_part(v_rest,' ',1),''),'1')::bigint; v_max:=coalesce(nullif(split_part(v_rest,' ',2),''),'100')::bigint; exception when others then v_min:=0; v_max:=-1; end;
  if v_min<0 or v_max<v_min or v_max>1000000 or v_max-v_min>1000000 then v_reply:='Формат: /random [от 0] [до 1000000].'; else v_reply:='🎯 Случайное число: '||(v_min+floor(random()*(v_max-v_min+1))::bigint)::text; v_game:='random'; end if;
 elsif v_command='choose' then
  v_options:=string_to_array(v_rest,'|');
  if coalesce(array_length(v_options,1),0)<2 or array_length(v_options,1)>10 or exists(select 1 from unnest(v_options) as opt(value) where btrim(value)='') then v_reply:='Формат: /choose вариант 1 | вариант 2 (от 2 до 10 непустых вариантов).';
  else v_choice:=btrim(v_options[1+floor(random()*array_length(v_options,1))::integer]); v_reply:='🎯 Выбор Злыди: «'||left(v_choice,180)||'»'; v_game:='choose'; end if;
 elsif v_command='yesno' then
  v_options:=array['Да','Скорее да','Пока неясно','Скорее нет','Нет']; v_reply:='🎱 Игровой ответ: '||v_options[1+floor(random()*array_length(v_options,1))::integer]||'. Это случайная игра, не совет для важных решений.'; v_game:='yesno';
 elsif v_command='percent' then
  v_reply:='🎲 Случайное значение: '||floor(random()*101)::integer::text||'%. Только развлекательный генератор, не прогноз.'; if v_rest<>'' then v_reply:=left(v_reply||E'\n'||left(v_rest,120),300); end if; v_game:='percent';
 elsif v_command='who' then
  select array_agg(m.user_id order by random()) into v_members from public.conversation_members m where m.conversation_id=new.conversation_id and m.user_id<>v_bot.bot_user_id;
  if coalesce(array_length(v_members,1),0)=0 then v_reply:='В группе пока некого выбрать.'; else select coalesce(p.display_name,p.username,'Участник') into v_name from public.profiles p where p.id=v_members[1]; v_reply:='🎯 Случайный участник: '||coalesce(v_name,'Участник')||'.'; v_game:='who'; end if;
 elsif v_command='pair' then
  select array_agg(m.user_id order by random()) into v_members from public.conversation_members m where m.conversation_id=new.conversation_id and m.user_id<>v_bot.bot_user_id;
  if coalesce(array_length(v_members,1),0)<2 then v_reply:='Для случайной команды нужны хотя бы два участника.';
  else select coalesce(p.display_name,p.username,'Участник') into v_name from public.profiles p where p.id=v_members[1]; select coalesce(p.display_name,p.username,'Участник') into v_name_two from public.profiles p where p.id=v_members[2]; v_reply:='🤝 Случайная команда: '||coalesce(v_name,'Участник')||' + '||coalesce(v_name_two,'Участник')||'.'; v_game:='pair'; end if;
 elsif v_command='say' then
  if length(v_rest) not between 1 and 1000 then v_reply:='Формат: /say текст (1–1000 символов).'; else v_reply:='Злыдя передаёт сообщение:'||E'\n'||'«'||v_rest||'»'; v_game:='say'; end if;
 elsif v_command in ('highfive','handshake','congrats','praise','apologize') then
  v_lookup:=regexp_replace(split_part(v_rest,' ',1),'^@','');
  begin v_target:=v_lookup::uuid; exception when others then select p.id into v_target from public.profiles p where lower(p.username)=lower(v_lookup) limit 1; end;
  if v_target is null or not exists(select 1 from public.conversation_members m where m.conversation_id=new.conversation_id and m.user_id=v_target) then v_reply:='Укажи участника группы: /'||v_command||' UUID или @username.';
  elsif v_target=new.sender_id then v_reply:='Выбери другого участника группы.';
  else select coalesce(p.display_name,p.username,'Участник') into v_name from public.profiles p where p.id=v_target; v_reply:=case v_command when 'highfive' then '🙌 Злыдя передаёт пять: ' when 'handshake' then '🤝 Злыдя предлагает рукопожатие: ' when 'congrats' then '🎉 Злыдя поздравляет: ' when 'praise' then '⭐ Злыдя хвалит: ' else '📝 Злыдя передаёт извинение: ' end||coalesce(v_name,'Участник')||'.'; v_game:='social'; end if;
 elsif v_command='game_stats' then
  select count(*) into v_count from public.rim_zladen_game_events where conversation_id=new.conversation_id and user_id=new.sender_id; v_reply:='Твоя игровая активность в этой группе: '||v_count::text||' команд.';
 elsif v_command='game_top' then
  select string_agg(rn::text||'. '||display_name||' — '||games::text,E'\n' order by rn) into v_lines from (select row_number() over(order by count(*) desc,min(e.created_at)) rn,coalesce(p.display_name,p.username,'Участник') display_name,count(*) games from public.rim_zladen_game_events e left join public.profiles p on p.id=e.user_id where e.conversation_id=new.conversation_id group by e.user_id,p.display_name,p.username order by count(*) desc limit 10) ranked;
  v_reply:='Топ игровой активности:'||E'\n'||coalesce(v_lines,'Пока нет результатов.');
 else return new;
 end if;
 if v_game in ('roll','random','choose','yesno','percent','who','pair','social','say') then insert into public.rim_zladen_game_events(conversation_id,user_id,game_key) values(new.conversation_id,new.sender_id,v_game); end if;
 if v_reply is not null and v_reply<>'' then
  insert into public.chat_messages(conversation_id,sender_id,body,client_message_id) values(new.conversation_id,v_bot.bot_user_id,left(v_reply,3000),'zladen-social:'||new.id::text) on conflict(sender_id,client_message_id) do nothing;
  update public.conversations set last_message_at=now() where id=new.conversation_id;
 end if;
 return new;
end $$;
revoke all on function private.rim_zladen_handle_social_games() from public,anon,authenticated;
drop trigger if exists rim_zladen_handle_social_games on public.chat_messages;
create trigger rim_zladen_handle_social_games after insert on public.chat_messages for each row execute function private.rim_zladen_handle_social_games();
