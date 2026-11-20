drop policy if exists rim_seed_hook_read_accounts on private.rim_seed_only_accounts;
create policy rim_seed_hook_read_accounts on private.rim_seed_only_accounts for select to supabase_auth_admin using(true);
drop policy if exists rim_seed_hook_manage_sessions on private.rim_seed_only_sessions;
create policy rim_seed_hook_manage_sessions on private.rim_seed_only_sessions for all to supabase_auth_admin using(true) with check(true);
grant usage on schema private to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
grant select on private.rim_seed_only_accounts to supabase_auth_admin;
grant select,insert,update on private.rim_seed_only_sessions to supabase_auth_admin;
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql security invoker set search_path=''
as $$ declare v_user_id uuid; v_session_id uuid; v_method text; v_status text; begin
  v_user_id:=nullif(event->>'user_id','')::uuid;
  v_session_id:=nullif(event->'claims'->>'session_id','')::uuid;
  v_method:=replace(coalesce(event->>'authentication_method',''), '"','');
  if v_user_id is null or v_session_id is null then return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','invalid_auth_context')); end if;
  select a.status into v_status from private.rim_seed_only_accounts a where a.user_id=v_user_id;
  if not found then return event; end if;
  if v_status='pending' then
    if v_method='token_refresh' and exists(select 1 from private.rim_seed_only_sessions s where s.session_id=v_session_id and s.user_id=v_user_id) then return event; end if;
    return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','RIM seed-only setup is pending.'));
  end if;
  if v_method='password' then
    insert into private.rim_seed_only_sessions(session_id,user_id) values(v_session_id,v_user_id) on conflict(session_id) do update set user_id=excluded.user_id;
    return event;
  end if;
  if v_method='token_refresh' and exists(select 1 from private.rim_seed_only_sessions s where s.session_id=v_session_id and s.user_id=v_user_id) then return event; end if;
  return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','This account requires RIM seed phrase authentication.'));
end $$;
revoke all on function public.custom_access_token_hook(jsonb) from public,anon,authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
