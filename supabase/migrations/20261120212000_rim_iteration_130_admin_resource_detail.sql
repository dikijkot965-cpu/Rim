-- Iteration 130: add 30-day active-user estimate and largest table breakdown.
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
    'users_active_30d',(select count(*) from auth.users where last_sign_in_at >= now()-interval '30 days'),
    'users_active_30d_quota',50000,
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
    ) provider_stats),
    'database_size_bytes',pg_database_size(current_database()),
    'database_quota_bytes',524288000,
    'storage_bytes',(select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else 0 end),0) from storage.objects o),
    'storage_quota_bytes',1073741824,
    'storage_objects',(select count(*) from storage.objects),
    'public_tables',(select count(*) from pg_catalog.pg_tables where schemaname='public'),
    'database_table_sizes',(select coalesce(jsonb_agg(jsonb_build_object('schema',schemaname,'table',relname,'bytes',total_bytes) order by total_bytes desc),'[]'::jsonb) from (
      select schemaname,relname,pg_total_relation_size((quote_ident(schemaname)||'.'||quote_ident(relname))::regclass) as total_bytes
      from pg_catalog.pg_stat_user_tables order by 3 desc limit 10
    ) top_tables),
    'storage_by_bucket',(select coalesce(jsonb_agg(jsonb_build_object('bucket_id',bucket_id,'objects',object_count,'bytes',byte_count) order by bucket_id),'[]'::jsonb) from (
      select o.bucket_id,count(*) as object_count,
        sum(case when (o.metadata->>'size') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else 0 end) as byte_count
      from storage.objects o group by o.bucket_id
    ) bucket_usage)
  ) into result;
  return result;
end;
$$;
revoke all on function public.rim_admin_dashboard_stats_v2() from public, anon;
grant execute on function public.rim_admin_dashboard_stats_v2() to authenticated;
