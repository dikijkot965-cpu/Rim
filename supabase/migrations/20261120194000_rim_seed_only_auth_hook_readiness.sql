create table if not exists private.rim_security_config(
  singleton boolean primary key default true check(singleton),
  auth_hook_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into private.rim_security_config(singleton,auth_hook_enabled) values(true,false) on conflict(singleton) do nothing;
alter table private.rim_security_config enable row level security;
revoke all on private.rim_security_config from public,anon,authenticated;
grant select,insert,update,delete on private.rim_security_config to service_role;
create or replace function public.rim_seed_only_readiness()
returns boolean language sql stable security definer set search_path=''
as $$ select coalesce((select auth_hook_enabled from private.rim_security_config where singleton=true),false) $$;
create or replace function public.rim_seed_only_mark_hook_ready(p_ready boolean)
returns boolean language plpgsql security definer set search_path='pg_catalog','private'
as $$ begin
  insert into private.rim_security_config(singleton,auth_hook_enabled,updated_at) values(true,p_ready,now())
  on conflict(singleton) do update set auth_hook_enabled=excluded.auth_hook_enabled,updated_at=now();
  return true;
end $$;
revoke all on function public.rim_seed_only_readiness() from public,anon,authenticated;
revoke all on function public.rim_seed_only_mark_hook_ready(boolean) from public,anon,authenticated;
grant execute on function public.rim_seed_only_readiness() to service_role;
grant execute on function public.rim_seed_only_mark_hook_ready(boolean) to service_role;
