alter table private.rim_seed_only_accounts add column if not exists status text not null default 'active';
alter table private.rim_seed_only_accounts drop constraint if exists rim_seed_only_accounts_status_check;
alter table private.rim_seed_only_accounts add constraint rim_seed_only_accounts_status_check check(status in ('pending','active'));

create or replace function public.rim_seed_only_begin(p_user_id uuid,p_phrase_hash text,p_password_salt text,p_session_id uuid)
returns boolean language plpgsql security definer set search_path='pg_catalog','public','private','auth'
as $$ begin
  if p_user_id is null or p_session_id is null or p_phrase_hash !~ '^[0-9a-f]{64}$' or p_password_salt !~ '^[A-Za-z0-9_-]{20,32}$' then raise exception 'invalid_seed_only_configuration'; end if;
  insert into private.rim_seed_only_accounts(user_id,phrase_hash,password_salt,status,enabled_at,updated_at) values(p_user_id,p_phrase_hash,p_password_salt,'pending',now(),now())
  on conflict(user_id) do update set phrase_hash=excluded.phrase_hash,password_salt=excluded.password_salt,status='pending',updated_at=now();
  insert into private.rim_seed_only_sessions(session_id,user_id) values(p_session_id,p_user_id) on conflict(session_id) do update set user_id=excluded.user_id;
  delete from auth.sessions where user_id=p_user_id and id<>p_session_id;
  return true;
end $$;
create or replace function public.rim_seed_only_activate(p_user_id uuid)
returns boolean language plpgsql security definer set search_path='pg_catalog','private'
as $$ begin update private.rim_seed_only_accounts set status='active',updated_at=now() where user_id=p_user_id and status='pending'; return found; end $$;
create or replace function public.rim_seed_only_cancel_pending(p_user_id uuid)
returns boolean language plpgsql security definer set search_path='pg_catalog','private'
as $$ begin
  delete from private.rim_seed_only_accounts where user_id=p_user_id and status='pending';
  delete from private.rim_seed_only_sessions s where s.user_id=p_user_id and not exists(select 1 from private.rim_seed_only_accounts a where a.user_id=p_user_id);
  return true;
end $$;
create or replace function public.rim_seed_only_lookup(p_phrase_hash text)
returns table(user_id uuid,password_salt text) language sql stable security definer set search_path=''
as $$ select a.user_id,a.password_salt from private.rim_seed_only_accounts a where a.phrase_hash=p_phrase_hash and a.status='active' limit 1 $$;
create or replace function public.rim_seed_only_status(p_user_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from private.rim_seed_only_accounts a where a.user_id=p_user_id and a.status='active') $$;

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

