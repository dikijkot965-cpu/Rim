-- Generate the independent pepper inside Supabase and store it encrypted in Vault.
do $$ begin
  if not exists (select 1 from vault.secrets where name='rim-recovery-pepper-v1') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'rim-recovery-pepper-v1','RIM recovery credential HMAC pepper; rotate only with a hash migration');
  end if;
end $$;

alter table public.rim_recovery_codes add column if not exists hash_version integer not null default 1;
alter table public.rim_recovery_codes drop constraint if exists rim_recovery_codes_hash_version_check;
alter table public.rim_recovery_codes add constraint rim_recovery_codes_hash_version_check check(hash_version in (1,2,3));
create index if not exists rim_recovery_codes_lookup_v2_idx on public.rim_recovery_codes(code_hash,credential_type,hash_version) where used_at is null;

create schema if not exists private;
create table if not exists private.rim_seed_only_accounts(
  user_id uuid primary key references auth.users(id) on delete cascade,
  phrase_hash text not null unique check(phrase_hash ~ '^[0-9a-f]{64}$'),
  password_salt text not null check(password_salt ~ '^[A-Za-z0-9_-]{20,32}$'),
  enabled_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists private.rim_seed_only_sessions(
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists rim_seed_only_sessions_user_idx on private.rim_seed_only_sessions(user_id,session_id);
alter table private.rim_seed_only_accounts enable row level security;
alter table private.rim_seed_only_sessions enable row level security;
revoke all on private.rim_seed_only_accounts,private.rim_seed_only_sessions from public,anon,authenticated;
grant select,insert,update,delete on private.rim_seed_only_accounts,private.rim_seed_only_sessions to service_role;

create or replace function public.rim_hash_recovery_credential(p_value text,p_context text)
returns text language plpgsql security definer set search_path=''
as $$ declare v_secret text; begin
  if p_value is null or length(p_value)>2048 or p_context not in ('phrase-v3','code-v3','rate-v3','seed-phrase-v1') then raise exception 'invalid_recovery_hash_request'; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='rim-recovery-pepper-v1' limit 1;
  if v_secret is null then raise exception 'recovery_pepper_unavailable'; end if;
  return encode(extensions.hmac(p_context||':'||p_value,v_secret,'sha256'),'hex');
end $$;
revoke all on function public.rim_hash_recovery_credential(text,text) from public,anon,authenticated;
grant execute on function public.rim_hash_recovery_credential(text,text) to service_role;

create or replace function public.rim_rotate_recovery_codes(p_user_id uuid,p_code_hashes text[])
returns void language plpgsql security definer set search_path='pg_catalog','public'
as $$ begin
  if p_user_id is null or coalesce(array_length(p_code_hashes,1),0)<>10 then raise exception 'invalid_recovery_code_batch'; end if;
  if (select count(distinct hash) from unnest(p_code_hashes) u(hash))<>10 or exists(select 1 from unnest(p_code_hashes) u(hash) where hash !~ '^[0-9a-f]{64}$') then raise exception 'invalid_recovery_code_hashes'; end if;
  delete from public.rim_recovery_codes where user_id=p_user_id and credential_type='code';
  insert into public.rim_recovery_codes(user_id,code_hash,credential_type,hash_version) select p_user_id,hash,'code',3 from unnest(p_code_hashes) u(hash);
end $$;

create or replace function public.rim_rotate_recovery_phrase(p_user_id uuid,p_phrase_hash text)
returns void language plpgsql security definer set search_path='pg_catalog','public'
as $$ begin
  if p_user_id is null or p_phrase_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_recovery_phrase_hash'; end if;
  delete from public.rim_recovery_codes where user_id=p_user_id and credential_type='phrase';
  insert into public.rim_recovery_codes(user_id,code_hash,credential_type,hash_version) values(p_user_id,p_phrase_hash,'phrase',3);
  insert into public.rim_account_security_state(user_id,recovery_phrase_created_at,updated_at) values(p_user_id,now(),now())
  on conflict(user_id) do update set recovery_phrase_created_at=excluded.recovery_phrase_created_at,updated_at=now();
end $$;

create or replace function public.rim_consume_recovery_code_v2(p_code_hash text,p_hash_version integer)
returns uuid language plpgsql security definer set search_path='pg_catalog','public'
as $$ declare v_user_id uuid; begin
  update public.rim_recovery_codes set used_at=now() where code_hash=p_code_hash and hash_version=p_hash_version and credential_type='code' and used_at is null returning user_id into v_user_id;
  return v_user_id;
end $$;
create or replace function public.rim_consume_recovery_phrase_v2(p_phrase_hash text,p_hash_version integer)
returns uuid language plpgsql security definer set search_path='pg_catalog','public'
as $$ declare v_user_id uuid; begin
  update public.rim_recovery_codes set used_at=now() where code_hash=p_phrase_hash and hash_version=p_hash_version and credential_type='phrase' and used_at is null returning user_id into v_user_id;
  return v_user_id;
end $$;

create or replace function public.rim_check_recovery_rate_limit(p_key_hash text,p_action text,p_limit integer default 8,p_window_seconds integer default 900)
returns boolean language plpgsql security definer set search_path='pg_catalog','public'
as $$ declare v_attempts integer; begin
  if p_key_hash !~ '^[0-9a-f]{64}$' or p_action not in ('issue_codes','issue_phrase','redeem_code','redeem_phrase','seed_login_ip','seed_login_user','seed_enable') or p_limit<1 or p_window_seconds<1 then raise exception 'invalid_rate_limit_request'; end if;
  delete from public.rim_recovery_rate_limits where window_started_at<now()-interval '2 days';
  insert into public.rim_recovery_rate_limits(key_hash,action,window_started_at,attempts) values(p_key_hash,p_action,now(),1)
  on conflict(key_hash,action) do update set
    window_started_at=case when public.rim_recovery_rate_limits.window_started_at+make_interval(secs=>p_window_seconds)<=now() then now() else public.rim_recovery_rate_limits.window_started_at end,
    attempts=case when public.rim_recovery_rate_limits.window_started_at+make_interval(secs=>p_window_seconds)<=now() then 1 else public.rim_recovery_rate_limits.attempts+1 end
  returning attempts into v_attempts;
  return v_attempts<=p_limit;
end $$;

create table if not exists private.rim_seed_only_accounts(
  user_id uuid primary key references auth.users(id) on delete cascade,
  phrase_hash text not null unique check(phrase_hash ~ '^[0-9a-f]{64}$'),
  password_salt text not null check(password_salt ~ '^[A-Za-z0-9_-]{20,32}$'),
  enabled_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists private.rim_seed_only_sessions(
  session_id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,created_at timestamptz not null default now()
);

create or replace function public.rim_seed_only_enable(p_user_id uuid,p_phrase_hash text,p_password_salt text,p_session_id uuid)
returns boolean language plpgsql security definer set search_path='pg_catalog','public','private','auth'
as $$ begin
  if p_user_id is null or p_session_id is null or p_phrase_hash !~ '^[0-9a-f]{64}$' or p_password_salt !~ '^[A-Za-z0-9_-]{20,32}$' then raise exception 'invalid_seed_only_configuration'; end if;
  insert into private.rim_seed_only_accounts(user_id,phrase_hash,password_salt,enabled_at,updated_at) values(p_user_id,p_phrase_hash,p_password_salt,now(),now())
  on conflict(user_id) do update set phrase_hash=excluded.phrase_hash,password_salt=excluded.password_salt,updated_at=now();
  insert into private.rim_seed_only_sessions(session_id,user_id) values(p_session_id,p_user_id) on conflict(session_id) do update set user_id=excluded.user_id;
  delete from auth.sessions where user_id=p_user_id and id<>p_session_id;
  return true;
end $$;
create or replace function public.rim_seed_only_disable(p_user_id uuid)
returns boolean language plpgsql security definer set search_path='pg_catalog','public','private'
as $$ begin delete from private.rim_seed_only_accounts where user_id=p_user_id; delete from private.rim_seed_only_sessions where user_id=p_user_id; return true; end $$;
create or replace function public.rim_seed_only_lookup(p_phrase_hash text)
returns table(user_id uuid,password_salt text) language sql stable security definer set search_path=''
as $$ select a.user_id,a.password_salt from private.rim_seed_only_accounts a where a.phrase_hash=p_phrase_hash limit 1 $$;
create or replace function public.rim_seed_only_status(p_user_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from private.rim_seed_only_accounts a where a.user_id=p_user_id) $$;
create or replace function public.rim_seed_only_session_status(p_user_id uuid,p_session_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from private.rim_seed_only_sessions where user_id=p_user_id and session_id=p_session_id) $$;

create or replace function private.rim_seed_session_authorized()
returns boolean language sql stable security definer set search_path=''
as $$ select case when auth.uid() is null then true when not exists(select 1 from private.rim_seed_only_accounts a where a.user_id=auth.uid()) then true else exists(select 1 from private.rim_seed_only_sessions s where s.user_id=auth.uid() and s.session_id=nullif(auth.jwt()->>'session_id','')::uuid) end $$;
revoke all on function private.rim_seed_session_authorized() from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.rim_seed_session_authorized() to authenticated;

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

do $$ declare r record; begin
  for r in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity loop
    execute format('drop policy if exists rim_seed_only_session_gate on %I.%I',r.nspname,r.relname);
    execute format('create policy rim_seed_only_session_gate on %I.%I as restrictive for all to authenticated using (private.rim_seed_session_authorized()) with check (private.rim_seed_session_authorized())',r.nspname,r.relname);
  end loop;
end $$;
do $$ begin
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage' and c.relname='objects' and c.relrowsecurity) then
    drop policy if exists rim_seed_only_session_gate on storage.objects;
    create policy rim_seed_only_session_gate on storage.objects as restrictive for all to authenticated using(private.rim_seed_session_authorized()) with check(private.rim_seed_session_authorized());
  end if;
end $$;

revoke all on function public.rim_rotate_recovery_codes(uuid,text[]) from public,anon,authenticated;
revoke all on function public.rim_rotate_recovery_phrase(uuid,text) from public,anon,authenticated;
revoke all on function public.rim_consume_recovery_code_v2(text,integer) from public,anon,authenticated;
revoke all on function public.rim_consume_recovery_phrase_v2(text,integer) from public,anon,authenticated;
revoke all on function public.rim_seed_only_enable(uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.rim_seed_only_disable(uuid) from public,anon,authenticated;
revoke all on function public.rim_seed_only_lookup(text) from public,anon,authenticated;
revoke all on function public.rim_seed_only_status(uuid) from public,anon,authenticated;
revoke all on function public.rim_seed_only_session_status(uuid,uuid) from public,anon,authenticated;
grant execute on function public.rim_rotate_recovery_codes(uuid,text[]) to service_role;
grant execute on function public.rim_rotate_recovery_phrase(uuid,text) to service_role;
grant execute on function public.rim_consume_recovery_code_v2(text,integer) to service_role;
grant execute on function public.rim_consume_recovery_phrase_v2(text,integer) to service_role;
grant execute on function public.rim_seed_only_enable(uuid,text,text,uuid) to service_role;
grant execute on function public.rim_seed_only_disable(uuid) to service_role;
grant execute on function public.rim_seed_only_lookup(text) to service_role;
grant execute on function public.rim_seed_only_status(uuid) to service_role;
grant execute on function public.rim_seed_only_session_status(uuid,uuid) to service_role;
