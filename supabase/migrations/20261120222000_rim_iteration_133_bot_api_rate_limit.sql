create table if not exists public.rim_bot_api_limits(
  bot_id uuid primary key references public.rim_bots(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  requests integer not null default 0
);
alter table public.rim_bot_api_limits enable row level security;
revoke all on public.rim_bot_api_limits from public,anon,authenticated;
grant all on public.rim_bot_api_limits to service_role;

create or replace function public.rim_bot_check_rate_limit(p_bot_id uuid,p_limit integer default 120,p_window_seconds integer default 60)
returns boolean language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_requests integer;
begin
 if p_limit<1 or p_window_seconds<1 then raise exception 'invalid_rate_limit'; end if;
 insert into public.rim_bot_api_limits(bot_id,window_started_at,requests) values(p_bot_id,now(),1)
 on conflict(bot_id) do update set
  window_started_at=case when public.rim_bot_api_limits.window_started_at+make_interval(secs=>p_window_seconds)<=now() then now() else public.rim_bot_api_limits.window_started_at end,
  requests=case when public.rim_bot_api_limits.window_started_at+make_interval(secs=>p_window_seconds)<=now() then 1 else public.rim_bot_api_limits.requests+1 end
 returning requests into v_requests;
 return v_requests<=p_limit;
end; $$;
revoke all on function public.rim_bot_check_rate_limit(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.rim_bot_check_rate_limit(uuid,integer,integer) to service_role;

create or replace function public.rim_bot_fetch_updates(p_bot_id uuid,p_offset bigint default 0,p_limit integer default 50)
returns setof public.rim_bot_updates language sql security definer set search_path=pg_catalog,public
as $$ select * from public.rim_bot_updates where bot_id=p_bot_id and id>=greatest(p_offset,1) order by id asc limit least(greatest(p_limit,1),100); $$;
revoke all on function public.rim_bot_fetch_updates(uuid,bigint,integer) from public,anon,authenticated;
grant execute on function public.rim_bot_fetch_updates(uuid,bigint,integer) to service_role;
