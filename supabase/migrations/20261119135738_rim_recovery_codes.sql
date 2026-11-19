-- One-time recovery codes. Raw codes are never stored; only keyed digests exist server-side.
create table if not exists public.rim_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique check (length(code_hash) = 64),
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists rim_recovery_codes_user_created_idx
  on public.rim_recovery_codes(user_id, created_at desc);
alter table public.rim_recovery_codes enable row level security;
revoke all on table public.rim_recovery_codes from public, anon, authenticated;
grant all on table public.rim_recovery_codes to service_role;

create or replace function public.rim_rotate_recovery_codes(p_user_id uuid, p_code_hashes text[])
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_id is null or coalesce(array_length(p_code_hashes, 1), 0) <> 10 then
    raise exception 'invalid_recovery_code_batch';
  end if;
  if (select count(distinct hash) from unnest(p_code_hashes) as u(hash)) <> 10
     or exists (select 1 from unnest(p_code_hashes) as u(hash) where hash !~ '^[0-9a-f]{64}$') then
    raise exception 'invalid_recovery_code_hashes';
  end if;
  delete from public.rim_recovery_codes where user_id = p_user_id;
  insert into public.rim_recovery_codes(user_id, code_hash)
    select p_user_id, hash from unnest(p_code_hashes) as u(hash);
end;
$$;
revoke all on function public.rim_rotate_recovery_codes(uuid, text[]) from public, anon, authenticated;
grant execute on function public.rim_rotate_recovery_codes(uuid, text[]) to service_role;

create or replace function public.rim_consume_recovery_code(p_code_hash text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
begin
  update public.rim_recovery_codes
     set used_at = now()
   where code_hash = p_code_hash
     and used_at is null
   returning user_id into v_user_id;
  return v_user_id;
end;
$$;
revoke all on function public.rim_consume_recovery_code(text) from public, anon, authenticated;
grant execute on function public.rim_consume_recovery_code(text) to service_role;
