# Iteration 158 — 2026-11-22

## Goal
Move E2E work from isolated runtime hardening toward server-side security and an integrated runtime proof. No production services were changed.

## Major implementation

### 1. Durable device revocation
Added `supabase/migrations/20261122110000_rim_iteration_158_e2e_device_revocation_tombstones.sql`.

- Device revocation now leaves a tombstone (`status='revoked'`, `enabled=false`, `registered=false`, `revoked_at`).
- Device-scoped prekeys and queued envelopes are removed on revocation.
- The account-level Signal identity remains intact because it is shared by the account and may be needed by other linked devices.
- Registration refuses to reactivate a revoked primary slot (`device_slot_revoked_requires_secure_link`).
- An active, unregistered primary slot can still retry interrupted first-time provisioning.
- Both RPCs remain service-role-only.

This closes a device-revocation resurrection path. Replacing a revoked primary device now requires a future trusted-device linking/recovery flow; it is intentionally not silently re-enrolled.

### 2. Bounded Edge Function request parsing
- Checks declared Content-Length before reading.
- Reads request bodies as a stream and stops/cancels as soon as the 512 KiB limit is exceeded.
- Maps `request_too_large` to HTTP 413.
- Avoids `req.text()` loading an arbitrarily large request body before enforcing the limit.

### 3. Runtime-level two-account integration proof
Extended `tests/manual-e2e-supabase-relay-two-account.mjs` with a test that instantiates two real `RimSignalProtocolRuntime` instances and the pinned Signal SDK, uses the actual RIM Supabase relay adapter contract, sends a direct message, decrypts it on the second account, verifies both local timeline records, and asserts that the mock relay envelope has no plaintext body and the plaintext does not occur in its encoded ciphertext.

- SDK cryptography: real package `@open-e2ee/signal-protocol-sdk@14.7.0`, PQ/Braid required.
- Transport: in-memory mock backend implementing the Edge Function/Realtime contract.
- Protocol store: SDK in-memory store; logs correctly warn that it has no at-rest encryption.
- Local message store: deterministic test double, not production IndexedDB.
- Both runtimes deliberately remain `protocolReady=false`.

This is stronger than the prior client-only round-trip, but it is still not a live Supabase/PostgreSQL/Realtime test.

### 4. Regression tests
Added `tests/e2e-iteration-158-device-revocation.test.js` for tombstone semantics, non-resurrection, service-role grants, and bounded Edge Function request parsing.

## Validation

- Existing baseline checks were rerun before edits: project check PASS, syntax PASS, Node suite 616/616, SDK/relay mock round-trip 1/1, Cloudflare build PASS.
- Iteration 158 focused tests: 4/4 PASS.
- Edge Function TypeScript check: PASS with the system TypeScript compiler and temporary ambient declarations for Deno/Supabase URL imports; this is not a substitute for Deno typechecking.
- Runtime-level two-account SDK test: PASS using the real SDK and RIM relay adapter with mock backend.
- PostgreSQL migration execution: NOT RUN (no `psql`, Supabase CLI, or staging credentials in this environment).
- Deno typecheck: NOT RUN (`deno` unavailable).
- Live Supabase two-account exchange: NOT RUN.
- Production Supabase, GitHub, and Cloudflare were not modified.

## Readiness
`protocolReady=false`. Do not enable E2E scopes or claim production readiness. Remaining major gates: apply and execute migration 158 on disposable PostgreSQL after previous migrations; Deno typecheck; authenticated staging Edge Function + Realtime test; browser OPFS/IndexedDB persistence; app auth-session lifecycle and real composer/timeline validation; linked-device/recovery flows.
