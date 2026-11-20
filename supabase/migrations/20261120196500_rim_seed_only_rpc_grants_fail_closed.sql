revoke all on function public.rim_seed_only_begin(uuid,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.rim_seed_only_activate(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rim_seed_only_cancel_pending(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rim_seed_only_begin(uuid,text,text,uuid) to service_role;
grant execute on function public.rim_seed_only_activate(uuid) to service_role;
grant execute on function public.rim_seed_only_cancel_pending(uuid) to service_role;
-- Retire the older single-step RPC so only the pending/activate protocol can enable seed-only.
revoke all on function public.rim_seed_only_enable(uuid,text,text,uuid) from public,anon,authenticated,service_role;
