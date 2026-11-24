-- Iteration 171: durable Zladen reminders with a database scheduler.
-- This migration is source-only until reviewed and applied intentionally.

create or replace function private.rim_zladen_handle_extended_message()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare
  v_bot public.rim_system_bot_registry%rowtype;
  v_group public.conversations%rowtype;
  v_token text;
  v_command text;
  v_rest text;
  v_reply text;
  v_rank integer:=0;
  v_target uuid;
  v_amount bigint;
  v_balance bigint;
  v_target_balance bigint;
  v_profile_visibility text;
  v_lookup text;
  v_target_rank integer:=0;
  v_title text;
  v_content text;
  v_parts text[];
  v_reason text;
  v_award text;
  v_award_title text;
  v_poll_id uuid;
  v_poll public.rim_zladen_polls%rowtype;
  v_option integer;
  v_message_id uuid;
  v_rows integer;
  v_duration text;
  v_duration_value integer;
  v_duration_unit text;
  v_reminder_text text;
  v_recurrence text := 'none';
  v_due_at timestamptz;
  v_reminder_id uuid;
  v_reminder_lines text;
begin
  if new.sender_id is null or coalesce(new.body,'')='' then return new; end if;
  select * into v_bot from public.rim_system_bot_registry where bot_key='zladen' and is_active=true;
  if not found or v_bot.bot_user_id is null or new.sender_id=v_bot.bot_user_id then return new; end if;
  if not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=v_bot.bot_user_id) then return new; end if;
  select * into v_group from public.conversations where id=new.conversation_id;
  if not found or coalesce(v_group.e2e_mode,'off')='required' then return new; end if;
  if exists(select 1 from public.rim_system_bot_installs where user_id=new.sender_id and bot_key='zladen' and state in ('blocked','unsubscribed')) then return new; end if;

  v_token:=lower(split_part(btrim(new.body),' ',1));
  if v_token ~ '^[/!.]' then v_command:=regexp_replace(v_token,'^[/!.]',''); else v_command:=v_token; end if;
  v_command:=regexp_replace(v_command,'@'||coalesce(v_bot.username,'zladen_bot')||'$','');
  v_rest:=btrim(substr(btrim(new.body),length(split_part(btrim(new.body),' ',1))+1));
  if lower(btrim(new.body))='кто я' then v_command:='me'; v_rest:=''; end if;
  if lower(btrim(new.body)) like 'кто ты %' then v_command:='who'; v_rest:=btrim(substr(btrim(new.body),length('кто ты ')+1)); end if;
  if lower(btrim(new.body))='мой баланс' then v_command:='balance'; v_rest:=''; end if;
  if lower(btrim(new.body))='моя репутация' then v_command:='rep'; v_rest:=''; end if;

  if v_group.type='group' then
    if v_group.created_by=new.sender_id then v_rank:=5;
    elsif exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=new.sender_id and role in ('owner','admin')) then v_rank:=4;
    else select coalesce(max(rank),0) into v_rank from public.rim_zladen_chat_roles where conversation_id=new.conversation_id and user_id=new.sender_id; end if;
  else v_rank:=0; end if;

  -- Permission override is evaluated centrally before every supported command.
  if v_group.type='group' and exists(select 1 from public.rim_zladen_command_permissions where conversation_id=new.conversation_id and command=v_command and (not enabled or v_rank<min_rank)) then
    v_reply:='У тебя нет доступа к этой команде.';
  elsif v_command in ('me','анкета') or (v_command='profile' and v_rest='') then
    insert into public.rim_zladen_user_profiles(user_id) values(new.sender_id) on conflict do nothing;
    select bio,public_tag into v_content,v_title from public.rim_zladen_user_profiles where user_id=new.sender_id;
    select balance into v_balance from public.rim_zladen_wallets where user_id=new.sender_id;
    v_reply:='Твой профиль РИМ / Злыдя'||E'\nID: '||new.sender_id::text||E'\nОписание: '||coalesce(nullif(v_content,''),'не заполнено')||E'\nТег: '||coalesce(nullif(v_title,''),'нет')||E'\nБаланс: '||coalesce(v_balance,0)::text||' жетонов';
  elsif v_command='who' or (v_command='profile' and v_rest<>'') then
    v_lookup:=regexp_replace(split_part(v_rest,' ',1),'^@','');
    begin v_target:=v_lookup::uuid; exception when others then
      select id into v_target from public.profiles where lower(username)=lower(v_lookup) limit 1;
    end;
    if v_target is null then v_reply:='Пользователь не найден. Формат: /who UUID или /who @username';
    else
      select profile_visibility,bio,public_tag,reputation into v_profile_visibility,v_content,v_title,v_balance
        from public.rim_zladen_user_profiles where user_id=v_target;
      if not found or (v_profile_visibility='private' and v_target<>new.sender_id) or (v_profile_visibility='members' and v_target<>new.sender_id and (v_group.type<>'group' or not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=new.sender_id) or not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=v_target))) then v_reply:='Профиль не найден или скрыт настройками приватности.';
      else
        v_reply:='Профиль участника'||E'\nID: '||v_target::text||E'\nОписание: '||coalesce(nullif(v_content,''),'не заполнено')||E'\nТег: '||coalesce(nullif(v_title,''),'нет')||E'\nРепутация: '||coalesce(v_balance,0)::text;
      end if;
    end if;
  elsif v_command='privacy' then
    if lower(v_rest) not in ('public','members','private') then v_reply:='Формат: /privacy public|members|private';
    else
      insert into public.rim_zladen_user_profiles(user_id,profile_visibility) values(new.sender_id,lower(v_rest))
      on conflict(user_id) do update set profile_visibility=excluded.profile_visibility,updated_at=now();
      v_reply:='Настройка приватности профиля обновлена.';
    end if;
  elsif v_command='bio' then
    if length(v_rest)>1000 then v_reply:='Описание не должно превышать 1000 символов.';
    else
      insert into public.rim_zladen_user_profiles(user_id,bio) values(new.sender_id,v_rest)
      on conflict(user_id) do update set bio=excluded.bio,updated_at=now();
      v_reply:='Описание профиля обновлено.';
    end if;
  elsif v_command='tag' then
    if length(v_rest)>32 then v_reply:='Тег не должен превышать 32 символа.';
    else
      insert into public.rim_zladen_user_profiles(user_id,public_tag) values(new.sender_id,v_rest)
      on conflict(user_id) do update set public_tag=excluded.public_tag,updated_at=now();
      v_reply:='Тег профиля обновлён.';
    end if;
  elsif v_command='balance' then
    select balance into v_balance from public.rim_zladen_wallets where user_id=new.sender_id;
    v_reply:='Твой баланс: '||coalesce(v_balance,0)::text||' жетонов. Жетоны — внутренняя игровая единица РИМа без денежной стоимости.';
  elsif v_command='grant' and v_group.type='group' then
    begin v_target:=split_part(v_rest,' ',1)::uuid; exception when others then v_target:=null; end;
    begin v_amount:=split_part(v_rest,' ',2)::bigint; exception when others then v_amount:=null; end;
    v_reason:=btrim(substr(v_rest,length(split_part(v_rest,' ',1))+length(split_part(v_rest,' ',2))+3));
    if v_rank<4 then v_reply:='Начислять жетоны могут только администраторы.';
    elsif v_target is null or v_amount is null or v_amount<1 or v_amount>100000 then v_reply:='Формат: /grant UUID количество причина (1–100000).';
    elsif not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=v_target) then v_reply:='Получатель должен состоять в этой беседе.';
    else
      insert into public.rim_zladen_wallets(user_id) values(v_target) on conflict do nothing;
      update public.rim_zladen_wallets set balance=balance+v_amount,updated_at=now() where user_id=v_target returning balance into v_target_balance;
      insert into public.rim_zladen_ledger(user_id,delta,balance_after,operation,operation_key,actor_id,reason,conversation_id)
      values(v_target,v_amount,v_target_balance,'grant','zladen-grant:'||new.id::text,new.sender_id,left(coalesce(nullif(v_reason,''),'Начисление администрацией'),500),new.conversation_id);
      v_reply:='Начислено '||v_amount::text||' жетонов.';
    end if;
  elsif v_command='pay' and v_group.type='group' then
    begin v_target:=split_part(v_rest,' ',1)::uuid; exception when others then v_target:=null; end;
    begin v_amount:=split_part(v_rest,' ',2)::bigint; exception when others then v_amount:=null; end;
    if v_target is null or v_amount is null or v_amount<1 or v_amount>100000 then v_reply:='Формат: /pay UUID количество (1–100000).';
    elsif v_target=new.sender_id then v_reply:='Нельзя переводить жетоны самому себе.';
    elsif not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=v_target) then v_reply:='Получатель должен состоять в этой беседе.';
    else
      insert into public.rim_zladen_wallets(user_id) values(new.sender_id),(v_target) on conflict do nothing;
      update public.rim_zladen_wallets set balance=balance-v_amount,updated_at=now() where user_id=new.sender_id and balance>=v_amount returning balance into v_balance;
      if not found then v_reply:='Недостаточно жетонов для перевода.';
      else
        update public.rim_zladen_wallets set balance=balance+v_amount,updated_at=now() where user_id=v_target returning balance into v_target_balance;
        insert into public.rim_zladen_ledger(user_id,delta,balance_after,operation,operation_key,counterparty_id,actor_id,reason,conversation_id)
        values(new.sender_id,-v_amount,v_balance,'transfer_out','zladen-pay:'||new.id::text||':out',v_target,new.sender_id,'Перевод участнику',new.conversation_id),
              (v_target,v_amount,v_target_balance,'transfer_in','zladen-pay:'||new.id::text||':in',new.sender_id,new.sender_id,'Перевод от участника',new.conversation_id);
        v_reply:='Перевод выполнен: '||v_amount::text||' жетонов.';
      end if;
    end if;
  elsif v_command='rep' and v_group.type='group' then
    begin v_target:=nullif(split_part(v_rest,' ',1),'')::uuid; exception when others then v_target:=null; end;
    if v_target is null then
      select coalesce(reputation,0) into v_balance from public.rim_zladen_user_profiles where user_id=new.sender_id;
      v_reply:='Твоя репутация: '||coalesce(v_balance,0)::text||'. Чтобы отметить участника: /rep UUID';
    elsif v_target=new.sender_id then v_reply:='Нельзя повышать собственную репутацию.';
    elsif not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=v_target) then v_reply:='Участник не найден в этой беседе.';
    else
      insert into public.rim_zladen_reputation_events(conversation_id,from_user,to_user) values(new.conversation_id,new.sender_id,v_target) on conflict do nothing;
      get diagnostics v_rows=row_count;
      if v_rows=0 then v_reply:='Ты уже отмечал этого участника сегодня.';
      else
        insert into public.rim_zladen_user_profiles(user_id,reputation) values(v_target,1)
        on conflict(user_id) do update set reputation=public.rim_zladen_user_profiles.reputation+1,updated_at=now();
        v_reply:='Репутация участника повышена на 1.';
      end if;
    end if;
  elsif v_command='note' then
    v_parts:=string_to_array(v_rest,'|');
    if array_length(v_parts,1) is null or array_length(v_parts,1)<2 then v_reply:='Формат: /note название | текст';
    else
      v_title:=left(btrim(v_parts[1]),100); v_content:=left(btrim(array_to_string(v_parts[2:array_length(v_parts,1)],'|')),10000);
      if v_title='' or v_content='' then v_reply:='Название и текст заметки не должны быть пустыми.';
      else
        insert into public.rim_zladen_notes(owner_id,conversation_id,title,content) values(new.sender_id,new.conversation_id,v_title,v_content);
        v_reply:='Заметка сохранена.';
      end if;
    end if;
  elsif v_command='notes' then
    select string_agg('• '||title,' '||E'\n' order by updated_at desc) into v_reply from (select title,updated_at from public.rim_zladen_notes where owner_id=new.sender_id order by updated_at desc limit 10) n;
    v_reply:='Твои заметки:'||E'\n'||coalesce(v_reply,'Пока нет заметок.');
  elsif v_command='report' and v_group.type='group' then
    begin v_target:=nullif(split_part(v_rest,' ',1),'')::uuid; exception when others then v_target:=null; end;
    v_reason:=btrim(substr(v_rest,length(split_part(v_rest,' ',1))+1));
    if v_target is null or length(v_reason)<2 then v_reply:='Формат: /report UUID причина';
    elsif v_target=new.sender_id then v_reply:='Нельзя отправить жалобу на себя.';
    elsif not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=v_target) then v_reply:='Участник не найден в этой беседе.';
    else
      insert into public.rim_zladen_reports(conversation_id,reporter_id,target_user_id,reason) values(new.conversation_id,new.sender_id,v_target,left(v_reason,120));
      v_reply:='Жалоба зарегистрирована. Её рассмотрит администрация беседы.';
    end if;
  elsif v_command='antispam' and v_group.type='group' then
    if v_rank<4 then v_reply:='Настраивать антиспам могут администраторы беседы.';
    elsif lower(v_rest) not in ('on','off') then v_reply:='Формат: /antispam on или /antispam off';
    else
      insert into public.rim_zladen_antispam_settings(conversation_id,enabled,updated_by) values(new.conversation_id,lower(v_rest)='on',new.sender_id)
      on conflict(conversation_id) do update set enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now();
      v_reply:='Антифлуд '||case when lower(v_rest)='on' then 'включён' else 'выключен' end||'. Порог: 8 сообщений за 10 секунд или более 3 повторов.';
    end if;
  elsif v_command='rank' and v_group.type='group' then
    begin v_target:=split_part(v_rest,' ',1)::uuid; exception when others then v_target:=null; end;
    begin v_option:=split_part(v_rest,' ',2)::integer; exception when others then v_option:=null; end;
    v_title:=btrim(substr(v_rest,length(split_part(v_rest,' ',1))+length(split_part(v_rest,' ',2))+3));
    if v_rank<4 then v_reply:='Назначать должности могут администраторы.';
    elsif v_target is null or v_option is null or v_option<1 or v_option>4 then v_reply:='Формат: /rank UUID уровень(1–4) название';
    elsif v_target=new.sender_id or v_target=v_group.created_by or not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=v_target) then v_reply:='Нельзя назначить должность себе, создателю или неучастнику.';
    elsif exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=v_target and role in ('owner','admin')) then v_reply:='Нельзя изменить встроенную роль администратора.';
    else
      select coalesce(max(rank),0) into v_target_rank from public.rim_zladen_chat_roles where conversation_id=new.conversation_id and user_id=v_target;
      if v_target_rank>=v_rank or (v_rank=4 and v_option>=4) then
        v_reply:='Нельзя назначить равную или более высокую должность. Уровень 4 может назначать только создатель беседы.';
      else
      insert into public.rim_zladen_chat_roles(conversation_id,user_id,rank,title,appointed_by) values(new.conversation_id,v_target,v_option,left(coalesce(v_title,''),40),new.sender_id)
      on conflict(conversation_id,user_id) do update set rank=excluded.rank,title=excluded.title,appointed_by=excluded.appointed_by,updated_at=now();
      insert into public.rim_zladen_audit(conversation_id,actor_id,action,target_user_id,details) values(new.conversation_id,new.sender_id,'rank_set',v_target,jsonb_build_object('rank',v_option,'title',left(coalesce(v_title,''),40)));
      v_reply:='Должность участника обновлена.';
      end if;
    end if;
  elsif v_command='award' and v_group.type='group' then
    begin v_target:=split_part(v_rest,' ',1)::uuid; exception when others then v_target:=null; end;
    v_award:=lower(split_part(v_rest,' ',2));
    v_reason:=btrim(substr(v_rest,length(split_part(v_rest,' ',1))+length(split_part(v_rest,' ',2))+3));
    if v_rank<4 then v_reply:='Выдавать награды могут администраторы.';
    elsif v_target is null or v_award='' or not exists(select 1 from public.rim_zladen_award_catalog where award_key=v_award and is_active) then v_reply:='Формат: /award UUID merit_1 причина. Доступны merit_1 … merit_8.';
    elsif not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=v_target) then v_reply:='Участник не найден в беседе.';
    else
      insert into public.rim_zladen_user_awards(user_id,conversation_id,award_key,granted_by,reason) values(v_target,new.conversation_id,v_award,new.sender_id,left(coalesce(v_reason,'Награда за вклад в сообщество'),500));
      select title into v_award_title from public.rim_zladen_award_catalog where award_key=v_award;
      v_reply:='Награда выдана: '||v_award_title||'.';
    end if;
  elsif v_command='awards' then
    begin v_target:=nullif(split_part(v_rest,' ',1),'')::uuid; exception when others then v_target:=null; end;
    v_target:=coalesce(v_target,new.sender_id);
    if v_target<>new.sender_id and v_rank<4 then v_reply:='Чужие награды могут просматривать только администраторы.';
    else
      select string_agg('• '||a.title,' '||E'\n' order by a.tier) into v_reply
      from public.rim_zladen_user_awards u join public.rim_zladen_award_catalog a on a.award_key=u.award_key
      where u.user_id=v_target and u.revoked_at is null and (u.expires_at is null or u.expires_at>now());
      v_reply:='Награды:'||E'\n'||coalesce(v_reply,'Наград пока нет.');
    end if;
  elsif v_command='top' and v_group.type='group' then
    select string_agg((rn::text||'. '||coalesce(display_name,username,'Участник')||' — '||message_count::text),' '||E'\n' order by message_count desc)
    into v_reply from (
      select row_number() over(order by s.message_count desc,s.last_message_at desc) as rn,s.message_count,p.display_name,p.username
      from public.rim_zladen_chat_member_stats s left join public.profiles p on p.id=s.user_id
      where s.conversation_id=new.conversation_id order by s.message_count desc,s.last_message_at desc limit 10
    ) ranked;
    v_reply:='Топ активности беседы:'||E'\n'||coalesce(v_reply,'Статистики пока нет.');
  elsif v_command='bookmark' then
    begin v_message_id:=split_part(v_rest,' ',1)::uuid; exception when others then v_message_id:=null; end;
    v_title:=btrim(substr(v_rest,length(split_part(v_rest,' ',1))+1));
    if v_message_id is null or not exists(select 1 from public.chat_messages where id=v_message_id and conversation_id=new.conversation_id) then v_reply:='Формат: /bookmark UUID_сообщения [подпись]. Сообщение должно быть в этой беседе.';
    else
      insert into public.rim_zladen_bookmarks(owner_id,conversation_id,message_id,label) values(new.sender_id,new.conversation_id,v_message_id,left(v_title,120)) on conflict(owner_id,message_id) do update set label=excluded.label;
      v_reply:='Сообщение добавлено в закладки.';
    end if;
  elsif v_command='bookmarks' then
    select string_agg('• '||coalesce(nullif(label,''),'Сообщение')||' — '||message_id::text,' '||E'\n' order by created_at desc)
      into v_reply from (select label,message_id,created_at from public.rim_zladen_bookmarks where owner_id=new.sender_id and conversation_id=new.conversation_id order by created_at desc limit 10) b;
    v_reply:='Закладки этой беседы:'||E'\n'||coalesce(v_reply,'Закладок пока нет.');
  elsif v_command='unbookmark' then
    begin v_message_id:=split_part(v_rest,' ',1)::uuid; exception when others then v_message_id:=null; end;
    if v_message_id is null then v_reply:='Формат: /unbookmark UUID_сообщения';
    else delete from public.rim_zladen_bookmarks where owner_id=new.sender_id and message_id=v_message_id; v_reply:='Закладка удалена (если существовала).'; end if;
  elsif v_command='poll' and v_group.type='group' then
    v_parts:=string_to_array(v_rest,'|');
    if array_length(v_parts,1) is null or array_length(v_parts,1)<3 or array_length(v_parts,1)>11 then v_reply:='Формат: /poll вопрос | вариант 1 | вариант 2 [| ещё варианты]. Нужно 2–10 вариантов.';
    else
      v_title:=left(btrim(v_parts[1]),500);
      if v_title='' or exists(select 1 from unnest(v_parts[2:array_length(v_parts,1)]) x where btrim(x)='') then v_reply:='Вопрос и варианты не должны быть пустыми.';
      else
        insert into public.rim_zladen_polls(conversation_id,creator_id,question,options) values(new.conversation_id,new.sender_id,v_title,to_jsonb(v_parts[2:array_length(v_parts,1)])) returning id into v_poll_id;
        v_reply:='Голосование создано. ID: '||v_poll_id::text||E'\nГолосуй: /vote '||v_poll_id::text||' номер_варианта';
      end if;
    end if;
  elsif v_command='vote' and v_group.type='group' then
    begin v_poll_id:=split_part(v_rest,' ',1)::uuid; exception when others then v_poll_id:=null; end;
    begin v_option:=split_part(v_rest,' ',2)::integer; exception when others then v_option:=null; end;
    select * into v_poll from public.rim_zladen_polls where id=v_poll_id and conversation_id=new.conversation_id;
    if not found or v_poll.is_closed or (v_poll.closes_at is not null and v_poll.closes_at<=now()) then v_reply:='Голосование не найдено или уже закрыто.';
    elsif v_option is null or v_option<1 or v_option>jsonb_array_length(v_poll.options) then v_reply:='Укажи номер существующего варианта.';
    else
      insert into public.rim_zladen_poll_votes(poll_id,user_id,option_index) values(v_poll_id,new.sender_id,v_option-1)
      on conflict(poll_id,user_id) do update set option_index=excluded.option_index,created_at=now();
      v_reply:='Твой голос учтён. Его можно изменить повторной командой /vote.';
    end if;
  elsif v_command='pollclose' and v_group.type='group' then
    begin v_poll_id:=split_part(v_rest,' ',1)::uuid; exception when others then v_poll_id:=null; end;
    update public.rim_zladen_polls set is_closed=true where id=v_poll_id and conversation_id=new.conversation_id and (creator_id=new.sender_id or v_rank>=4);
    get diagnostics v_rows=row_count;
    v_reply:=case when v_rows>0 then 'Голосование закрыто.' else 'Не удалось закрыть голосование: проверь ID и права.' end;
  elsif v_command='pollresults' and v_group.type='group' then
    begin v_poll_id:=split_part(v_rest,' ',1)::uuid; exception when others then v_poll_id:=null; end;
    select * into v_poll from public.rim_zladen_polls where id=v_poll_id and conversation_id=new.conversation_id;
    if not found then v_reply:='Голосование не найдено.';
    else
      select string_agg((o.ordinality::text||'. '||o.option_text||' — '||coalesce(v.cnt,0)::text),' '||E'\n' order by o.ordinality)
      into v_reply from jsonb_array_elements_text(v_poll.options) with ordinality as o(option_text,ordinality)
      left join (select option_index,count(*) cnt from public.rim_zladen_poll_votes where poll_id=v_poll_id group by option_index) v on v.option_index=o.ordinality-1;
      v_reply:='Результаты: '||v_poll.question||E'\n'||coalesce(v_reply,'Голосов пока нет.');
    end if;
  elsif v_command='remind' then
    v_duration:=lower(split_part(v_rest,' ',1));
    if v_duration='list' then
      select string_agg(left(id::text,8)||' · '||to_char(due_at at time zone 'UTC','DD.MM.YYYY HH24:MI')||' UTC · '||left(reminder_text,90),E'\n' order by due_at)
        into v_reminder_lines
      from (select id,due_at,reminder_text from public.rim_zladen_reminders
        where user_id=new.sender_id and conversation_id=new.conversation_id and status='pending'
        order by due_at limit 10) r;
      v_reply:='Твои ближайшие напоминания:'||E'\n'||coalesce(v_reminder_lines,'Активных напоминаний нет.')||E'\nОтмена: /remind cancel ID.';
    elsif v_duration='cancel' then
      v_reminder_text:=lower(btrim(split_part(v_rest,' ',2)));
      if v_reminder_text !~ '^[0-9a-f]{8,36}$' then
        v_reply:='Укажи ID напоминания из /remind list. Нужны первые 8 символов UUID.';
      else
        with target as (
          select id from public.rim_zladen_reminders
          where user_id=new.sender_id and conversation_id=new.conversation_id and status='pending'
            and id::text like v_reminder_text||'%'
          order by due_at limit 1 for update
        )
        update public.rim_zladen_reminders r set status='cancelled' from target t where r.id=t.id;
        get diagnostics v_rows=row_count;
        v_reply:=case when v_rows>0 then 'Напоминание отменено.' else 'Активное напоминание не найдено.' end;
      end if;
    else
      if v_duration !~ '^[1-9][0-9]{0,3}(m|h|d|w)$' then
        v_reply:='Формат: /remind 10m текст, /remind 2h текст, /remind 1d daily текст. Просмотр: /remind list.';
      else
        v_duration_value:=substring(v_duration from '^[0-9]+')::integer;
        v_duration_unit:=right(v_duration,1);
        if v_duration_value>365 then
          v_reply:='Интервал слишком большой. Максимум — 365 единиц.';
        else
          v_recurrence:=lower(split_part(v_rest,' ',2));
          if v_recurrence not in ('daily','weekly','monthly') then v_recurrence:='none'; end if;
          if v_recurrence='none' then
            v_reminder_text:=btrim(substr(v_rest,length(v_duration)+2));
          else
            v_reminder_text:=btrim(substr(v_rest,length(v_duration)+length(v_recurrence)+3));
          end if;
          if char_length(v_reminder_text) not between 1 and 1000 then
            v_reply:='Текст напоминания должен содержать от 1 до 1000 символов.';
          else
            v_due_at:=now()+case v_duration_unit
              when 'm' then make_interval(mins=>v_duration_value)
              when 'h' then make_interval(hours=>v_duration_value)
              when 'd' then make_interval(days=>v_duration_value)
              when 'w' then make_interval(weeks=>v_duration_value)
            end;
            insert into public.rim_zladen_reminders(user_id,conversation_id,reminder_text,due_at,timezone,recurrence)
            values(new.sender_id,new.conversation_id,v_reminder_text,v_due_at,'UTC',v_recurrence)
            returning id into v_reminder_id;
            v_reply:='Напоминание создано: '||to_char(v_due_at at time zone 'UTC','DD.MM.YYYY HH24:MI')||' UTC.'||
              case when v_recurrence='none' then '' else ' Повтор: '||v_recurrence||'.' end||
              E'\n'||'ID: '||left(v_reminder_id::text,8)||'. Просмотр: /remind list.';
          end if;
        end if;
      end if;
    end if;
  end if;

  if v_reply is not null and length(v_reply)>0 then
    insert into public.chat_messages(conversation_id,sender_id,body,client_message_id)
    values(new.conversation_id,v_bot.bot_user_id,left(v_reply,4000),'zladen-ext:'||new.id::text)
    on conflict(sender_id,client_message_id) do nothing;
    update public.conversations set last_message_at=now() where id=new.conversation_id;
  end if;
  return new;
end $$;


create or replace function private.rim_zladen_dispatch_due_reminders(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  v_reminder public.rim_zladen_reminders%rowtype;
  v_bot public.rim_system_bot_registry%rowtype;
  v_conversation public.conversations%rowtype;
  v_next_due timestamptz;
  v_rows integer;
  v_delivered integer:=0;
  v_message text;
begin
  select * into v_bot from public.rim_system_bot_registry where bot_key='zladen' and is_active=true;
  if not found or v_bot.bot_user_id is null then return 0; end if;

  for v_reminder in
    select * from public.rim_zladen_reminders
    where status='pending' and due_at<=now()
    order by due_at
    limit greatest(1,least(coalesce(p_limit,100),500))
    for update skip locked
  loop
    begin
      if v_reminder.conversation_id is null then
        update public.rim_zladen_reminders set status='failed' where id=v_reminder.id;
        continue;
      end if;
      select * into v_conversation from public.conversations where id=v_reminder.conversation_id;
      if not found
        or coalesce(v_conversation.e2e_mode,'off')='required'
        or not exists(select 1 from public.conversation_members where conversation_id=v_reminder.conversation_id and user_id=v_reminder.user_id)
        or not exists(select 1 from public.conversation_members where conversation_id=v_reminder.conversation_id and user_id=v_bot.bot_user_id) then
        update public.rim_zladen_reminders set status='failed' where id=v_reminder.id;
        continue;
      end if;

      v_message:='⏰ Напоминание: '||v_reminder.reminder_text;
      insert into public.chat_messages(conversation_id,sender_id,body,client_message_id)
      values(v_reminder.conversation_id,v_bot.bot_user_id,left(v_message,4000),
        'zladen-reminder:'||v_reminder.id::text||':'||to_char(v_reminder.due_at at time zone 'UTC','YYYYMMDDHH24MISS'))
      on conflict(sender_id,client_message_id) do nothing;
      update public.conversations set last_message_at=now() where id=v_reminder.conversation_id;

      if v_reminder.recurrence='none' then
        update public.rim_zladen_reminders set status='delivered',delivered_at=now() where id=v_reminder.id;
      else
        v_next_due:=v_reminder.due_at;
        while v_next_due<=now() loop
          v_next_due:=v_next_due+case v_reminder.recurrence
            when 'daily' then interval '1 day'
            when 'weekly' then interval '1 week'
            when 'monthly' then interval '1 month'
          end;
        end loop;
        update public.rim_zladen_reminders set due_at=v_next_due,delivered_at=now(),status='pending' where id=v_reminder.id;
      end if;
      v_delivered:=v_delivered+1;
    exception when others then
      update public.rim_zladen_reminders set status='failed' where id=v_reminder.id;
    end;
  end loop;
  return v_delivered;
end;
$$;

revoke all on function private.rim_zladen_dispatch_due_reminders(integer) from public,anon,authenticated;

-- Recreate the named job idempotently. pg_cron is already enabled in this project.
do $$
declare v_job bigint;
begin
  for v_job in select jobid from cron.job where jobname='rim-zladen-reminders' loop
    perform cron.unschedule(v_job);
  end loop;
  perform cron.schedule('rim-zladen-reminders','* * * * *','select private.rim_zladen_dispatch_due_reminders();');
end;
$$;

comment on function private.rim_zladen_dispatch_due_reminders(integer) is 'Minute scheduler for Zladen reminders; skips E2E-required conversations and fails closed when membership or bot presence is missing.';
