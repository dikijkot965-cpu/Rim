-- RIM Iteration 138 — Zladen shared profiles, ranks, safe virtual economy,
-- reputation, awards, notes, reports, polls, reminders, clans, triggers and anti-spam.
-- Additive only. No real-money features, wagering, loot boxes or gambling.
-- Zladen must never inspect or reply to E2E-required conversations.

create table if not exists public.rim_zladen_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bio text not null default '',
  public_tag text not null default '',
  profile_visibility text not null default 'public' check(profile_visibility in ('public','members','private')),
  show_balance boolean not null default true,
  show_reputation boolean not null default true,
  reputation bigint not null default 0 check(reputation >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(char_length(bio)<=1000),
  check(char_length(public_tag)<=32)
);

create table if not exists public.rim_zladen_chat_roles (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rank smallint not null check(rank between 1 and 4),
  title text not null default '',
  appointed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(conversation_id,user_id),
  check(char_length(title)<=40)
);
create index if not exists rim_zladen_chat_roles_rank_idx on public.rim_zladen_chat_roles(conversation_id,rank desc);

create table if not exists public.rim_zladen_command_permissions (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  command text not null,
  enabled boolean not null default true,
  min_rank smallint not null default 0 check(min_rank between 0 and 5),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(conversation_id,command),
  check(command ~ '^[a-z0-9_]{2,32}$')
);

create table if not exists public.rim_zladen_command_aliases (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  alias text not null,
  command text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(conversation_id,alias),
  check(alias ~ '^[a-zа-яё0-9_]{2,32}$'),
  check(command ~ '^[a-z0-9_]{2,32}$')
);

-- Internal points are non-transferable outside RIM and have no cash value.
-- This iteration only supports balance, transparent transfers and admin grants.
create table if not exists public.rim_zladen_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance bigint not null default 0 check(balance>=0 and balance<=9000000000000000),
  updated_at timestamptz not null default now()
);
create table if not exists public.rim_zladen_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta bigint not null check(delta<>0),
  balance_after bigint not null check(balance_after>=0),
  operation text not null check(operation in ('grant','transfer_in','transfer_out','admin_adjustment','purchase','refund')),
  operation_key text not null unique,
  counterparty_id uuid references auth.users(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  reason text not null default '',
  conversation_id uuid references public.conversations(id) on delete set null,
  created_at timestamptz not null default now(),
  check(char_length(reason)<=500)
);
create index if not exists rim_zladen_ledger_user_recent_idx on public.rim_zladen_ledger(user_id,created_at desc);

create table if not exists public.rim_zladen_reputation_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  delta smallint not null default 1 check(delta=1),
  reason text not null default '',
  day_key date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now(),
  unique(conversation_id,from_user,to_user,day_key),
  check(from_user<>to_user),
  check(char_length(reason)<=300)
);
create index if not exists rim_zladen_rep_target_idx on public.rim_zladen_reputation_events(conversation_id,to_user,created_at desc);

create table if not exists public.rim_zladen_award_catalog (
  award_key text primary key,
  title text not null,
  description text not null default '',
  tier smallint not null check(tier between 1 and 8),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check(award_key ~ '^[a-z0-9_]{2,32}$'),
  check(char_length(title)<=80),
  check(char_length(description)<=500)
);
insert into public.rim_zladen_award_catalog(award_key,title,description,tier) values
('merit_1','Знак заслуги I степени','Первая степень награды',1),
('merit_2','Знак заслуги II степени','Вторая степень награды',2),
('merit_3','Знак заслуги III степени','Третья степень награды',3),
('merit_4','Знак заслуги IV степени','Четвёртая степень награды',4),
('merit_5','Знак заслуги V степени','Пятая степень награды',5),
('merit_6','Знак заслуги VI степени','Шестая степень награды',6),
('merit_7','Знак заслуги VII степени','Седьмая степень награды',7),
('merit_8','Знак заслуги VIII степени','Восьмая степень награды',8)
on conflict(award_key) do nothing;
create table if not exists public.rim_zladen_user_awards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  award_key text not null references public.rim_zladen_award_catalog(award_key),
  granted_by uuid references auth.users(id) on delete set null,
  reason text not null default '',
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check(char_length(reason)<=500)
);
create index if not exists rim_zladen_awards_user_idx on public.rim_zladen_user_awards(user_id,created_at desc) where revoked_at is null;

create table if not exists public.rim_zladen_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  title text not null,
  content text not null,
  visibility text not null default 'private' check(visibility in ('private','chat')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(char_length(title) between 1 and 100),
  check(char_length(content) between 1 and 10000)
);
create index if not exists rim_zladen_notes_owner_idx on public.rim_zladen_notes(owner_id,updated_at desc);

create table if not exists public.rim_zladen_bookmarks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  label text not null default '',
  created_at timestamptz not null default now(),
  unique(owner_id,message_id),
  check(char_length(label)<=120)
);
create index if not exists rim_zladen_bookmarks_owner_idx on public.rim_zladen_bookmarks(owner_id,created_at desc);

create table if not exists public.rim_zladen_reports (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete set null,
  message_id uuid references public.chat_messages(id) on delete set null,
  reason text not null,
  details text not null default '',
  status text not null default 'open' check(status in ('open','reviewing','resolved','rejected')),
  assigned_to uuid references auth.users(id) on delete set null,
  resolution text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(char_length(reason) between 2 and 120),
  check(char_length(details)<=2000),
  check(char_length(resolution)<=1000)
);
create index if not exists rim_zladen_reports_queue_idx on public.rim_zladen_reports(conversation_id,status,created_at desc);

create table if not exists public.rim_zladen_polls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  question text not null,
  options jsonb not null,
  is_anonymous boolean not null default false,
  is_closed boolean not null default false,
  closes_at timestamptz,
  created_at timestamptz not null default now(),
  check(char_length(question) between 3 and 500),
  check(jsonb_typeof(options)='array' and jsonb_array_length(options) between 2 and 10)
);
create table if not exists public.rim_zladen_poll_votes (
  poll_id uuid not null references public.rim_zladen_polls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_index smallint not null check(option_index between 0 and 9),
  created_at timestamptz not null default now(),
  primary key(poll_id,user_id)
);

create table if not exists public.rim_zladen_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  reminder_text text not null,
  due_at timestamptz not null,
  timezone text not null default 'UTC',
  recurrence text not null default 'none' check(recurrence in ('none','daily','weekly','monthly')),
  status text not null default 'pending' check(status in ('pending','delivered','cancelled','failed')),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  check(char_length(reminder_text) between 1 and 1000)
);
create index if not exists rim_zladen_reminders_due_idx on public.rim_zladen_reminders(due_at) where status='pending';

create table if not exists public.rim_zladen_clans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  owner_id uuid not null references auth.users(id) on delete restrict,
  emblem text not null default '🏛️',
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(slug ~ '^[a-z0-9_]{3,24}$'),
  check(char_length(name) between 2 and 60),
  check(char_length(description)<=1000)
);
create table if not exists public.rim_zladen_clan_members (
  clan_id uuid not null references public.rim_zladen_clans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  clan_role text not null default 'member' check(clan_role in ('leader','deputy','member')),
  joined_at timestamptz not null default now(),
  primary key(clan_id,user_id)
);
create index if not exists rim_zladen_clan_members_user_idx on public.rim_zladen_clan_members(user_id);

create table if not exists public.rim_zladen_triggers (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  name text not null,
  event_type text not null check(event_type in ('message','join','warning_threshold')),
  condition jsonb not null default '{}'::jsonb,
  action_type text not null check(action_type in ('warn','mute','notify_admins','audit')),
  action_config jsonb not null default '{}'::jsonb,
  priority smallint not null default 100 check(priority between 1 and 1000),
  is_enabled boolean not null default true,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(char_length(name) between 2 and 80)
);
create index if not exists rim_zladen_triggers_event_idx on public.rim_zladen_triggers(conversation_id,event_type,priority) where is_enabled;
create table if not exists public.rim_zladen_trigger_logs (
  id bigint generated always as identity primary key,
  trigger_id uuid references public.rim_zladen_triggers(id) on delete set null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action_type text not null,
  result text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.rim_zladen_antispam_settings (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  enabled boolean not null default false,
  window_seconds integer not null default 10 check(window_seconds between 3 and 120),
  max_messages integer not null default 8 check(max_messages between 3 and 100),
  max_duplicates integer not null default 3 check(max_duplicates between 2 and 30),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.rim_zladen_rate_buckets (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  message_count integer not null default 0,
  last_body_hash text,
  duplicate_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(conversation_id,user_id)
);

create table if not exists public.rim_zladen_chat_member_stats (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message_count bigint not null default 0,
  first_message_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  primary key(conversation_id,user_id)
);
create index if not exists rim_zladen_chat_stats_rank_idx on public.rim_zladen_chat_member_stats(conversation_id,message_count desc,last_message_at desc);

-- Every new table is private to SECURITY DEFINER routines; no direct client writes.
do $$
declare t text;
begin
  foreach t in array array[
    'rim_zladen_user_profiles','rim_zladen_chat_roles','rim_zladen_command_permissions','rim_zladen_command_aliases',
    'rim_zladen_wallets','rim_zladen_ledger','rim_zladen_reputation_events','rim_zladen_award_catalog','rim_zladen_user_awards',
    'rim_zladen_notes','rim_zladen_bookmarks','rim_zladen_reports','rim_zladen_polls','rim_zladen_poll_votes',
    'rim_zladen_reminders','rim_zladen_clans','rim_zladen_clan_members','rim_zladen_triggers','rim_zladen_trigger_logs',
    'rim_zladen_antispam_settings','rim_zladen_rate_buckets','rim_zladen_chat_member_stats'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
  end loop;
end $$;

-- Optional anti-flood guard. It stores only a message digest, never message text.
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
    duplicate_count=case
      when public.rim_zladen_rate_buckets.window_started_at < now()-make_interval(secs=>v_cfg.window_seconds) then 1
      when public.rim_zladen_rate_buckets.last_body_hash=v_hash then public.rim_zladen_rate_buckets.duplicate_count+1 else 1 end,
    last_body_hash=v_hash,updated_at=now()
  returning message_count,duplicate_count into v_count,v_dupes;
  if v_count>v_cfg.max_messages or v_dupes>v_cfg.max_duplicates then
    insert into public.rim_zladen_audit(conversation_id,actor_id,action,details)
    values(new.conversation_id,new.sender_id,'antispam_block',jsonb_build_object('message_count',v_count,'duplicate_count',v_dupes));
    return null;
  end if;
  return new;
end $$;
revoke all on function private.rim_zladen_rate_limit_message() from public,anon,authenticated;
drop trigger if exists rim_zladen_rate_limit_message on public.chat_messages;
create trigger rim_zladen_rate_limit_message before insert on public.chat_messages
for each row execute function private.rim_zladen_rate_limit_message();

-- Message statistics count metadata only. No body text is copied or analysed here.
create or replace function private.rim_zladen_track_message_stats()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare v_bot_id uuid;
begin
  select bot_user_id into v_bot_id from public.rim_system_bot_registry where bot_key='zladen';
  if new.sender_id is null or new.sender_id=v_bot_id then return new; end if;
  insert into public.rim_zladen_chat_member_stats(conversation_id,user_id,message_count,first_message_at,last_message_at)
  values(new.conversation_id,new.sender_id,1,coalesce(new.created_at,now()),coalesce(new.created_at,now()))
  on conflict(conversation_id,user_id) do update set message_count=public.rim_zladen_chat_member_stats.message_count+1,last_message_at=excluded.last_message_at;
  return new;
end $$;
revoke all on function private.rim_zladen_track_message_stats() from public,anon,authenticated;
drop trigger if exists rim_zladen_track_message_stats on public.chat_messages;
create trigger rim_zladen_track_message_stats after insert on public.chat_messages
for each row execute function private.rim_zladen_track_message_stats();

-- Additive command extension: the previous moderation handler remains intact.
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
    v_reply:='Планировщик напоминаний подготовлен в базе, но фоновый исполнитель ещё не развёрнут. Напоминание пока не создано.';
  end if;

  if v_reply is not null and length(v_reply)>0 then
    insert into public.chat_messages(conversation_id,sender_id,body,client_message_id)
    values(new.conversation_id,v_bot.bot_user_id,left(v_reply,4000),'zladen-ext:'||new.id::text)
    on conflict(sender_id,client_message_id) do nothing;
    update public.conversations set last_message_at=now() where id=new.conversation_id;
  end if;
  return new;
end $$;
revoke all on function private.rim_zladen_handle_extended_message() from public,anon,authenticated;
drop trigger if exists rim_zladen_handle_extended_message on public.chat_messages;
create trigger rim_zladen_handle_extended_message after insert on public.chat_messages
for each row execute function private.rim_zladen_handle_extended_message();

comment on table public.rim_zladen_wallets is 'Non-cash internal RIM points. No wagering, cash-out, loot boxes or gambling mechanics.';
comment on table public.rim_zladen_ledger is 'Append-only ledger for idempotent internal point operations.';
comment on table public.rim_zladen_triggers is 'Declarative community automation. Actions are allowlisted; arbitrary code is never executed.';
comment on table public.rim_zladen_antispam_settings is 'Opt-in per-group rate limiting; disabled by default and bypassed for E2E-required scopes.';


-- Keep the original moderation pipeline, but publish the expanded command reference.
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
  v_command := regexp_replace(lower(split_part(btrim(new.body),' ',1)),'@'||coalesce(v_bot.username,'zladen_bot')||'$','');
  v_rest := btrim(substr(btrim(new.body),length(split_part(btrim(new.body),' ',1))+1));
  select (v_group.created_by=new.sender_id or exists(
    select 1 from public.conversation_members m where m.conversation_id=new.conversation_id
      and m.user_id=new.sender_id and m.role in ('owner','admin')
  )) into v_actor_manager;

  if v_command in ('/start','/help','/commands') then
    if v_group.type='group' then
      v_reply := 'Злыдя — помощник группы. Команды участников: /menu, /rules, /info, /admins, /stats, /me, /who UUID, /privacy public|members|private, /balance, /rep UUID, /note название | текст, /notes, /bookmark UUID, /bookmarks, /unbookmark UUID, /report UUID причина, /poll вопрос | вариант 1 | вариант 2, /vote ID номер, /pollresults ID, /top.'||E'\n'||
        'Администраторам: /setrules текст, /setwelcome текст, /warn UUID причина, /warnings [UUID], /clearwarns UUID, /mute UUID минуты причина, /unmute UUID, /kick UUID, /ban UUID причина, /unban UUID, /rank UUID 1–4 название, /grant UUID количество причина, /award UUID merit_1…merit_8 причина, /antispam on|off, /command имя ответ, /delcommand имя.'||E'\n'||
        'В личном диалоге: /me, /bio текст, /tag текст, /balance, /note название | текст, /notes.';
    else
      v_reply := 'Я Злыдя — системный помощник РИМа.'||E'\n'||'/start, /help, /commands, /menu, /ping, /id, /info, /me, /who UUID, /privacy public|members|private, /bio текст, /tag текст, /balance, /note название | текст, /notes, /bookmark UUID, /bookmarks, /unbookmark UUID.';
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
