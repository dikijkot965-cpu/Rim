# Iteration 157 — 2026-11-22

## Scope
Focused lifecycle hardening of the Signal Protocol runtime's incoming delivery startup. No cryptographic algorithm, SQL migration, production backend, UI, or legacy RIM feature changes.

## Changes
- Concurrent `startIncoming()` calls now share one in-flight operation. The SDK's server sync and relay subscription are no longer started multiple times by parallel auth/startup callers.
- A successfully started client is remembered; repeated startup calls for the same live client return the current state without repeating synchronization or creating another relay subscription.
- `startIncoming()` now awaits the SDK subscription operation and validates account/runtime generation again after it completes.
- A startup request arriving during runtime disposal waits for disposal and retries against the new runtime generation instead of joining the stale startup promise.
- Disposal detaches an uncancellable in-flight startup promise. Generation checks ensure the stale operation cannot subscribe if its pending sync later resumes.
- Added four regression tests covering concurrent startup, retry after subscription failure, restart while the previous startup sync is still pending, and late subscription attachment after disposal.
- Corrected stale iteration metadata in the module map and app logger version.

## Validation
- `npm run check`: PASS (121 mapped source modules; 24 legacy scripts).
- `npm run check:syntax`: PASS (328 JavaScript files).
- `npm test`: PASS (616/616).
- `npm run test:e2e:relay`: PASS (1/1 SDK PQ/Braid relay-contract round-trip through mock Edge Function/Realtime backend; mock store has no at-rest encryption).
- `npm run audit:html`: completed (93 sites: 14 REVIEW, 24 OK, 55 STATIC).
- `npm run build:cloudflare`: PASS (164 Worker assets; 165 Pages files).
- Focused runtime tests: PASS (23/23).
- SDK 14.7.0 entrypoint import: PASS using the existing offline bootstrap artifact.
- SDK browser store entrypoints (`web-sqlite`, `web`): present.

## Not yet verified
- No PostgreSQL runtime execution of E2E migrations.
- No Deno typecheck/deployment of `rim-e2e-relay`.
- No live Supabase two-account mailbox/Realtime exchange.
- `startIncoming()` remains intentionally unwired to automatic production auth events; no isolated staging environment is available/authorized.
- No browser/Android OPFS, account recovery, linked-device, group, or real-device key-rotation test.
- `protocolReady` remains `false`.

## Safety boundary
No production Supabase, GitHub, or Cloudflare changes. No production deployment. Iteration 144 remains excluded.
