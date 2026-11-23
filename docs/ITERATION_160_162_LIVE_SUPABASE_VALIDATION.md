# Iterations 160–162 — live Supabase validation

Date: 2026-11-22  
Application version: `4.1.8-iteration.160`  
Project: active RIM Supabase project (EU West)

## Database migrations applied

- `rim_iteration_160_e2e_shared_scope_relay_guard`
- `rim_iteration_161_e2e_peer_metadata_scope_guard`
- `rim_iteration_162_disable_legacy_prekey_claim`

## What changed

### Iteration 160 — database write guards

A `SECURITY DEFINER` trigger function with a fixed `search_path` is attached to:

- `rim_e2e_relay_prekey_fetch_limits` — prevents prekey probing unless the two accounts share a direct conversation, private group, or private channel. The guard runs before the rate-limit row can be inserted and before the relay RPC can consume any prekey.
- `rim_e2e_relay_envelopes` — prevents an unrelated authenticated account from routing ciphertext into another user's mailbox.

Live SQL tests passed for both negative cases (unrelated synthetic UUIDs rejected) and positive cases (an actual pair of members in an existing direct conversation passes the membership guard). The positive test ran inside `BEGIN … ROLLBACK`; no durable test row was left.

### Iteration 161 — peer metadata scope

Added `rim_e2e_users_share_scope(uuid,uuid)`, a stable security-definer helper with a fixed search path. Its execute privilege is revoked from `PUBLIC`, `anon`, and `authenticated`, and granted only to `service_role`.

Verified on live PostgreSQL:

- unrelated accounts return `false`;
- an existing direct-conversation member pair returns `true`;
- `anon` cannot execute the helper;
- `authenticated` cannot execute the helper;
- `service_role` can execute the helper.

Deployed `rim-e2e-relay` version 2, `ACTIVE`, `verify_jwt=true`, deployment hash `cecfed1b4687ef7b6a560ba29614ab3a6131ff77354c72a148935180d0f3fe7f`. `get_devices`, `get_active_devices`, and `get_identity` now require shared-scope authorization when looking up another account. The active account can still inspect its own device metadata.

### Iteration 162 — retire legacy prekey claim path

The older `rim_e2e_claim_prekey_bundle(uuid,uuid)` RPC belongs to the unused legacy device/prekey tables and is not called by the active Signal SDK runtime. Execute permission was revoked from `PUBLIC`, `anon`, and `authenticated`; only `service_role` retains execute. Live privilege check passed.

## Browser live-test surface

Added `?rim-e2e-lab=1` panel. It uses the current Supabase Auth session and never asks for passwords or copied JWTs. Device registration is behind an explicit confirmation. The send action verifies that the selected direct conversation has exactly the signed-in user and the peer as members, then uses the actual browser Signal SDK runtime to send a synthetic encrypted test message.

The receiver panel reports the decrypted message through the SDK hook. This test does not insert the synthetic message into the ordinary plaintext RIM timeline.

## Local validation

- `npm run check` — PASS, 122 mapped modules.
- `npm run check:syntax` — PASS, 332 JavaScript files.
- `npm test` — PASS, 626/626.
- `npm run test:e2e:relay` — PASS, 2/2 Signal SDK PQ/Braid relay-adapter/runtime round trips against the mock relay contract.
- `npm run build:cloudflare` — PASS, 165 Worker assets and 166 Pages assets; browser bundle built with esbuild.
- `npm run audit:html` — 93 innerHTML sites: 14 REVIEW, 24 OK, 55 STATIC.
- `npm run verify` — PASS; optional Playwright browser suite skipped because `@playwright/test` is not installed.

The mock two-account tests use in-memory SDK stores and therefore do not validate at-rest encryption. The browser runtime uses the configured encrypted OPFS SQLite store or its encrypted IndexedDB fallback; that still needs real Android/WebView testing.

## Still outstanding

- Authenticated two-account exchange against the deployed Edge Function and live Realtime.
- Verify actual ciphertext-only rows in the live mailbox after the user test.
- Reload/restart persistence, OPFS and Android WebView compatibility.
- Secure linked-device enrollment/key transfer and recovery UX.
- Full RIM message timeline integration, attachments, groups and sender-key workflows.

`protocolReady=false` remains. No production conversation was switched to `required`; no user device was enrolled by these migrations or tests.

## Supabase Security Advisor snapshot

After Iteration 162, the advisor no longer lists the legacy `rim_e2e_claim_prekey_bundle` RPC as an authenticated-executable security-definer function. The project still reports 54 authenticated-executable `SECURITY DEFINER` functions across the wider RIM schema; these are not all introduced by E2E. The two E2E scope RPCs in that set (`rim_e2e_get_scope_device_readiness` and `rim_e2e_request_scope_enable`) are intentionally callable by signed-in users and include `auth.uid()` plus conversation/channel membership and manager/eligibility checks. A full application-wide audit of the other 52 functions remains separate work.

The advisor also reports nine RLS-enabled tables without policies. Four are the E2E relay's device, identity, prekey and rate-limit tables; this is intentional because client roles have no direct table privileges and all mutations/reads go through the authenticated Edge Function using `service_role`. Do not add blanket authenticated policies to these relay tables.
