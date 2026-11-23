# RIM Iteration 159 — live Supabase validation

Date: 2026-11-22  
Baseline: Iteration 158  
Version: `4.1.8-iteration.159`

## Major result

The E2E backend was moved from mock-only validation to real PostgreSQL and a real Supabase Edge Function deployment in the active RIM project.

### PostgreSQL

Applied the E2E-specific migrations: 136, 142, 143, 145, 149, 153, 154 and 158. Unrelated Zladen migrations 137–141 were deliberately not applied as part of this E2E deployment.

Live SQL checks passed inside rollback transactions using synthetic test auth users: primary device registration for two accounts; identity provisioning; prekey upload; prekey bundle retrieval; KEM one-time-prekey consumption; envelope send in both directions; durable revocation tombstone; deletion of device-scoped prekeys and queued envelopes; denial of re-registration after revocation; denial of acknowledgement from a revoked device; and prekey fetch rate limiting at the 31st attempt in a 10-minute bucket. The test transactions were rolled back, and a follow-up query confirmed the synthetic auth users were absent.

The relay RPC permission audit confirmed that relay mutation/fetch/ack RPCs are executable by `service_role` only, not `anon` or `authenticated`. The scope-readiness RPC is executable by `authenticated` as intended.

### Migration defect discovered and corrected

The original Iteration 143 SQL dropped the legacy four-argument `rim_e2e_relay_fetch_prekey_bundle` overload and then attempted to `REVOKE` privileges from that now-nonexistent signature. PostgreSQL returned SQLSTATE `42883` and rejected the migration. The legacy overload's permissions had already been revoked by Iteration 142, so the redundant `REVOKE` was removed from the migration source and the corrected migration was applied successfully. A regression test now guards this ordering defect.

### Edge Function / Deno

Deployed `rim-e2e-relay` to the real Supabase Edge Runtime. Supabase reported status `ACTIVE`, version 1, with `verify_jwt=true`. The unauthenticated endpoint probe was rejected with HTTP 401 by the Supabase gateway (`UNAUTHORIZED_NO_AUTH_HEADER`), confirming the endpoint is protected. Deployment succeeded in the Supabase Deno Edge Runtime.

The valid-JWT request path and all individual actions still need authenticated client testing. No user JWT or password was available in this engineering session, and no user credentials were requested.

## Safety and activation boundary

- No existing user accounts, messages, conversations, channels or production E2E device records were used for test data.
- Synthetic auth users and their relay data existed only inside rollback transactions; the rollback was verified.
- The function requires JWT verification and uses the project's server-side service role key internally. That key was not exposed in this release artifact.
- `protocolReady=false` remains unchanged. No automatic enrollment and no E2E-required scope activation were performed.
- No production chat messages were rewritten and no existing message bodies were touched.

## Remaining tests

1. Authenticated client calls to register, provision, upload, send, pull and acknowledge.
2. Two independent real user accounts exchanging a message through the deployed Edge Function and live Realtime.
3. Verify ciphertext-only rows and decrypt on recipient device.
4. Restart/recovery, IndexedDB persistence, Android WebView and linked-device lifecycle.
