create or replace function public.rim_check_recovery_rate_limit(
  p_key_hash text,
  p_action text,
  p_limit integer default 8,
  p_window_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path='pg_catalog','public'
as $$
declare v_attempts integer;
begin
  if p_key_hash !~ '^[0-9a-f]{64}$'
     or p_action not in ('issue_codes','issue_phrase','redeem_code','redeem_phrase','seed_login_ip','seed_login_user','seed_enable','seed_login_phrase','push_message','push_channel_post')
     or p_limit<1 or p_window_seconds<1 then
    raise exception 'invalid_rate_limit_request';
  end if;
  delete from public.rim_recovery_rate_limits where window_started_at < now()-interval '2 days';
  insert into public.rim_recovery_rate_limits(key_hash,action,window_started_at,attempts)
  values(p_key_hash,p_action,now(),1)
  on conflict(key_hash,action) do update set
    window_started_at=case when public.rim_recovery_rate_limits.window_started_at+make_interval(secs=>p_window_seconds)<=now() then now() else public.rim_recovery_rate_limits.window_started_at end,
    attempts=case when public.rim_recovery_rate_limits.window_started_at+make_interval(secs=>p_window_seconds)<=now() then 1 else public.rim_recovery_rate_limits.attempts+1 end
  returning attempts into v_attempts;
  return v_attempts<=p_limit;
end;
$$;
revoke all on function public.rim_check_recovery_rate_limit(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.rim_check_recovery_rate_limit(text,text,integer,integer) to service_role;
