-- RIM 4.1 engineering hardening: recovery phrase, rate limits, music analytics, admin insights.
-- Additive migration: preserves existing recovery codes, tracks, and account data.

alter table public.rim_recovery_codes
  add column if not exists credential_type text not null default 'code';

alter table public.rim_recovery_codes
  drop constraint if exists rim_recovery_codes_credential_type_check;
alter table public.rim_recovery_codes
  add constraint rim_recovery_codes_credential_type_check
  check (credential_type in ('code', 'phrase'));

create index if not exists rim_recovery_credentials_user_type_idx
  on public.rim_recovery_codes(user_id, credential_type, created_at desc);

create table if not exists public.rim_account_security_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  onboarding_shown_at timestamptz,
  recovery_phrase_created_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.rim_account_security_state enable row level security;
revoke all on table public.rim_account_security_state from public, anon, authenticated;
grant all on table public.rim_account_security_state to service_role;

create table if not exists public.rim_recovery_rate_limits (
  key_hash text not null,
  action text not null,
  window_started_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  primary key (key_hash, action)
);
alter table public.rim_recovery_rate_limits enable row level security;
revoke all on table public.rim_recovery_rate_limits from public, anon, authenticated;
grant all on table public.rim_recovery_rate_limits to service_role;

create or replace function public.rim_rotate_recovery_codes(p_user_id uuid, p_code_hashes text[])
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if p_user_id is null or coalesce(array_length(p_code_hashes, 1), 0) <> 10 then
    raise exception 'invalid_recovery_code_batch';
  end if;
  if (select count(distinct hash) from unnest(p_code_hashes) as u(hash)) <> 10
     or exists (select 1 from unnest(p_code_hashes) as u(hash) where hash !~ '^[0-9a-f]{64}$') then
    raise exception 'invalid_recovery_code_hashes';
  end if;
  delete from public.rim_recovery_codes where user_id = p_user_id and credential_type = 'code';
  insert into public.rim_recovery_codes(user_id, code_hash, credential_type)
    select p_user_id, hash, 'code' from unnest(p_code_hashes) as u(hash);
end;
$$;
revoke all on function public.rim_rotate_recovery_codes(uuid, text[]) from public, anon, authenticated;
grant execute on function public.rim_rotate_recovery_codes(uuid, text[]) to service_role;

create or replace function public.rim_rotate_recovery_phrase(p_user_id uuid, p_phrase_hash text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if p_user_id is null or p_phrase_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_recovery_phrase_hash';
  end if;
  delete from public.rim_recovery_codes where user_id = p_user_id and credential_type = 'phrase';
  insert into public.rim_recovery_codes(user_id, code_hash, credential_type)
    values (p_user_id, p_phrase_hash, 'phrase');
  insert into public.rim_account_security_state(user_id, recovery_phrase_created_at, updated_at)
    values (p_user_id, now(), now())
  on conflict (user_id) do update
    set recovery_phrase_created_at = excluded.recovery_phrase_created_at, updated_at = now();
end;
$$;
revoke all on function public.rim_rotate_recovery_phrase(uuid, text) from public, anon, authenticated;
grant execute on function public.rim_rotate_recovery_phrase(uuid, text) to service_role;

create or replace function public.rim_consume_recovery_phrase(p_phrase_hash text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_user_id uuid;
begin
  update public.rim_recovery_codes
     set used_at = now()
   where code_hash = p_phrase_hash and credential_type = 'phrase' and used_at is null
   returning user_id into v_user_id;
  return v_user_id;
end;
$$;
revoke all on function public.rim_consume_recovery_phrase(text) from public, anon, authenticated;
grant execute on function public.rim_consume_recovery_phrase(text) to service_role;

create or replace function public.rim_check_recovery_rate_limit(
  p_key_hash text, p_action text, p_limit integer default 8, p_window_seconds integer default 900
) returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_attempts integer;
begin
  if p_key_hash !~ '^[0-9a-f]{64}$' or p_action not in ('issue_codes','issue_phrase','redeem_code','redeem_phrase')
     or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid_rate_limit_request';
  end if;
  delete from public.rim_recovery_rate_limits where window_started_at < now() - interval '2 days';
  insert into public.rim_recovery_rate_limits(key_hash, action, window_started_at, attempts)
  values (p_key_hash, p_action, now(), 1)
  on conflict (key_hash, action) do update set
    window_started_at = case
      when public.rim_recovery_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= now() then now()
      else public.rim_recovery_rate_limits.window_started_at end,
    attempts = case
      when public.rim_recovery_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= now() then 1
      else public.rim_recovery_rate_limits.attempts + 1 end
  returning attempts into v_attempts;
  return v_attempts <= p_limit;
end;
$$;
revoke all on function public.rim_check_recovery_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.rim_check_recovery_rate_limit(text, text, integer, integer) to service_role;

-- Cloud music analytics are additive and remain scoped by the existing owner RLS policies.
alter table public.music_tracks add column if not exists file_size bigint not null default 0;
alter table public.music_tracks add column if not exists play_count bigint not null default 0;
alter table public.music_tracks add column if not exists completed_plays bigint not null default 0;
alter table public.music_tracks add column if not exists listened_seconds bigint not null default 0;
alter table public.music_tracks add column if not exists daily_plays jsonb not null default '{}'::jsonb;
alter table public.music_tracks add column if not exists is_favorite boolean not null default false;
alter table public.music_tracks add column if not exists last_played_at timestamptz;
alter table public.music_tracks add constraint music_tracks_stats_nonnegative_check
  check (file_size >= 0 and play_count >= 0 and completed_plays >= 0 and listened_seconds >= 0);

-- Expanded admin dashboard: aggregate statistics only, never password or recovery secret material.
create or replace function public.rim_admin_dashboard_stats_v2()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.app_user_roles r where r.user_id = auth.uid() and r.role = 'superadmin'
  ) then raise exception 'Доступ только для суперадминистратора'; end if;
  select jsonb_build_object(
    'users_total',(select count(*) from auth.users),
    'users_active_24h',(select count(*) from auth.users where last_sign_in_at >= now()-interval '24 hours'),
    'users_new_7d',(select count(*) from auth.users where created_at >= now()-interval '7 days'),
    'users_new_30d',(select count(*) from auth.users where created_at >= now()-interval '30 days'),
    'users_with_password',(select count(*) from auth.users where encrypted_password is not null and encrypted_password <> ''),
    'users_with_recovery_phrase',(select count(distinct user_id) from public.rim_recovery_codes where credential_type='phrase' and used_at is null),
    'users_with_recovery_codes',(select count(distinct user_id) from public.rim_recovery_codes where credential_type='code' and used_at is null),
    'recovery_attempts_24h',(select coalesce(sum(attempts),0) from public.rim_recovery_rate_limits where window_started_at >= now()-interval '24 hours'),
    'channels_total',(select count(*) from public.channels),
    'groups_total',(select count(*) from public.conversations where type='group'),
    'direct_chats_total',(select count(*) from public.conversations where type='direct'),
    'messages_total',(select count(*) from public.chat_messages),
    'comments_total',(select count(*) from public.channel_post_comments),
    'polls_total',(select count(*) from public.channel_polls),
    'poll_votes_total',(select count(*) from public.channel_poll_votes),
    'reports_new',(select count(*) from public.user_reports where status='new'),
    'ads_total',(select count(*) from public.ad_campaigns),
    'ad_impressions_24h',(select count(*) from public.ad_events where event_type='impression' and created_at>=now()-interval '24 hours'),
    'ad_clicks_24h',(select count(*) from public.ad_events where event_type='click' and created_at>=now()-interval '24 hours'),
    'sessions_active',(select count(*) from auth.sessions where not_after is null or not_after>now()),
    'sessions_24h',(select count(*) from auth.sessions where updated_at>=now()-interval '24 hours'),
    'events_24h',(select count(*) from public.app_analytics_events where created_at>=now()-interval '24 hours'),
    'music_tracks_total',(select count(*) from public.music_tracks),
    'music_plays_total',(select coalesce(sum(play_count),0) from public.music_tracks),
    'music_listened_seconds',(select coalesce(sum(listened_seconds),0) from public.music_tracks),
    'paid_contracts_total',(select coalesce(sum(f.contract_amount),0) from public.ad_campaign_financials f where f.payment_status='paid'),
    'auth_providers',(select coalesce(jsonb_object_agg(provider, provider_count),'{}'::jsonb) from (
      select i.provider, count(distinct i.user_id) provider_count from auth.identities i group by i.provider
    ) provider_stats)
  ) into result;
  return result;
end;
$$;
revoke all on function public.rim_admin_dashboard_stats_v2() from public, anon;
grant execute on function public.rim_admin_dashboard_stats_v2() to authenticated;

create or replace function public.rim_admin_list_users_v2(p_limit integer default 100, p_offset integer default 0)
returns table(
  user_id uuid, email text, username text, display_name text,
  created_at timestamptz, last_sign_in_at timestamptz, last_seen_at timestamptz,
  role text, providers text[], has_password boolean,
  recovery_phrase_enabled boolean, recovery_codes_enabled boolean
) language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.app_user_roles r where r.user_id=auth.uid() and r.role='superadmin') then
    raise exception 'Доступ только для суперадминистратора';
  end if;
  return query
  select u.id::uuid, u.email::text, p.username::text, p.display_name::text,
    u.created_at::timestamptz, u.last_sign_in_at::timestamptz, p.last_seen_at::timestamptz,
    coalesce(r.role,'user')::text,
    coalesce((select array_agg(distinct i.provider order by i.provider) from auth.identities i where i.user_id=u.id), array[]::text[]),
    (u.encrypted_password is not null and u.encrypted_password <> ''),
    exists(select 1 from public.rim_recovery_codes rc where rc.user_id=u.id and rc.credential_type='phrase' and rc.used_at is null),
    exists(select 1 from public.rim_recovery_codes rc where rc.user_id=u.id and rc.credential_type='code' and rc.used_at is null)
  from auth.users u
  left join public.profiles p on p.id=u.id
  left join public.app_user_roles r on r.user_id=u.id
  order by u.created_at desc
  limit greatest(1,least(coalesce(p_limit,100),250)) offset greatest(coalesce(p_offset,0),0);
end;
$$;
revoke all on function public.rim_admin_list_users_v2(integer, integer) from public, anon;
grant execute on function public.rim_admin_list_users_v2(integer, integer) to authenticated;

create or replace function public.rim_admin_search_users_v2(p_query text, p_limit integer default 50)
returns table(
  user_id uuid, email text, username text, display_name text,
  created_at timestamptz, last_sign_in_at timestamptz, last_seen_at timestamptz,
  role text, providers text[], has_password boolean,
  recovery_phrase_enabled boolean, recovery_codes_enabled boolean
) language plpgsql stable security definer set search_path = '' as $$
declare q text := lower(trim(coalesce(p_query,'')));
begin
  if auth.uid() is null or not exists (select 1 from public.app_user_roles r where r.user_id=auth.uid() and r.role='superadmin') then
    raise exception 'Доступ только для суперадминистратора';
  end if;
  if length(q)<2 then return; end if;
  return query
  select u.id::uuid, u.email::text, p.username::text, p.display_name::text,
    u.created_at::timestamptz, u.last_sign_in_at::timestamptz, p.last_seen_at::timestamptz,
    coalesce(r.role,'user')::text,
    coalesce((select array_agg(distinct i.provider order by i.provider) from auth.identities i where i.user_id=u.id), array[]::text[]),
    (u.encrypted_password is not null and u.encrypted_password <> ''),
    exists(select 1 from public.rim_recovery_codes rc where rc.user_id=u.id and rc.credential_type='phrase' and rc.used_at is null),
    exists(select 1 from public.rim_recovery_codes rc where rc.user_id=u.id and rc.credential_type='code' and rc.used_at is null)
  from auth.users u
  left join public.profiles p on p.id=u.id
  left join public.app_user_roles r on r.user_id=u.id
  where lower(coalesce(p.username,'')) like '%'||q||'%'
     or lower(coalesce(p.display_name,'')) like '%'||q||'%'
     or lower(coalesce(u.email,'')) like '%'||q||'%'
  order by u.created_at desc limit greatest(1,least(coalesce(p_limit,50),100));
end;
$$;
revoke all on function public.rim_admin_search_users_v2(text, integer) from public, anon;
grant execute on function public.rim_admin_search_users_v2(text, integer) to authenticated;
