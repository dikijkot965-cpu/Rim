-- Iteration 162: the legacy prekey-claim RPC is not used by the active Signal relay.
-- Keep it service-role-only so authenticated clients cannot consume legacy prekeys.
revoke all on function public.rim_e2e_claim_prekey_bundle(uuid,uuid) from public, anon, authenticated;
grant execute on function public.rim_e2e_claim_prekey_bundle(uuid,uuid) to service_role;
