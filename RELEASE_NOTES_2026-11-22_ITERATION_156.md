# Iteration 156 — 2026-11-22

## Scope
Focused hardening of incoming E2E mailbox recovery in `SupabaseSignalProtocolRelay`. No crypto algorithm, schema migration, production backend, UI, or legacy RIM feature changes.

## Changes
- Mailbox recovery now receives a subscription-liveness guard and checks it before/after asynchronous pulls and between envelope deliveries. Unsubscribing prevents a pending recovery request from delivering later rows to a stale SDK client.
- Duplicate Realtime `SUBSCRIBED` notifications now coalesce into one in-flight mailbox recovery task per subscription, avoiding duplicate concurrent recovery scans.
- Added regression tests for cancellation during an in-flight mailbox pull and duplicate subscription-status events.

## Validation
- `npm test`: PASS, 612/612.
- `npm run check`: PASS (121 mapped source modules; 24 legacy scripts).
- `npm run check:syntax`: PASS (328 JavaScript files).
- `npm run test:e2e:relay`: PASS (1/1 SDK PQ/Braid round-trip through the RIM adapter contract with mock Edge Function/Realtime backend). Test output explicitly warns that the in-memory mock store has no at-rest encryption; this is not a real Supabase test.
- `npm run audit:html`: completed, 93 sites (14 REVIEW, 24 OK, 55 STATIC).
- `npm run build:cloudflare`: PASS (164 Worker assets; 165 Pages files).
- Combined sequential command timed out after `npm run check`; remaining checks were rerun separately and passed.

## Still not verified
- No PostgreSQL runtime execution of migrations 136, 142, 143, 145, 149, 153, 154.
- No Deno typecheck or deployment of `rim-e2e-relay`.
- No live Supabase two-account mailbox/Realtime exchange.
- `startIncoming()` remains unwired to the authenticated application session lifecycle.
- No browser/Android OPFS, recovery, linked-device, group, or real-device key-rotation test.
- `protocolReady` remains false. Production Supabase, GitHub, and Cloudflare were not modified.
