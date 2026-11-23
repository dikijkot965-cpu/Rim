# RIM 4.1.8 — Iteration 155

## E2E runtime lifecycle cancellation

- Added a monotonic lifecycle generation to `RimSignalProtocolRuntime`. Explicit disposal invalidates any in-flight initialization even when the authenticated account remains unchanged.
- `initialize()` now waits for an in-progress disposal before opening another client/store pair.
- Every asynchronous initialization boundary checks both authenticated account identity and the captured lifecycle generation. A stale initialization closes its partially created client, relay and storage.
- `startIncoming()` captures the lifecycle generation and revalidates it after the SDK initial mailbox sync. If the runtime is disposed during sync, it does not start a late relay subscription.
- Added explicit `setCurrentDevice(userId, deviceId)` binding to the RIM relay adapter. Runtime now sets the active local device context after verifying or registering the primary device, so a returning browser can fetch peer prekey bundles without re-registering an existing device. The adapter rejects cross-account selection and device IDs outside 1–5; server RPCs still independently authorize requester devices.
- Added four regression tests: dispose during SDK module loading; dispose during incoming initial sync; selecting the existing device after browser restart; and relay-side device binding validation.
- Stabilized an unrelated recovery-phrase test: it now flips a checksum bit deterministically instead of mutating random entropy, which had a 1/16 chance of accidentally producing another valid phrase.
- No E2E cryptographic algorithm, SDK version, database migration, UI, or existing RIM feature was changed.

## Validation

- Full Node test suite: PASS (610/610; final run 25.8 seconds).
- Recovery phrase service tests: 20 consecutive runs PASS after removing the probabilistic assertion.
- Focused E2E runtime suite: PASS (18/18).
- Project check: PASS (121 mapped source modules; 24 legacy scripts).
- Syntax check: PASS (328 JavaScript files).
- SDK/RIM relay adapter PQ+Braid round-trip: PASS (1/1; mock Edge Function/Realtime backend only; test logs explicitly warn the mock local store has no encryption at rest).
- HTML audit: 93 sites (14 REVIEW, 24 OK, 55 STATIC).
- Cloudflare build: PASS (164 Worker assets; 165 Pages files).
- Archive integrity and SHA-256 verified.

## E2E readiness — unchanged

- `protocolReady=false`; no user-facing E2E enablement.
- `startIncoming()` exists in the runtime but is not yet invoked by the application auth/session lifecycle. Incoming E2E subscription is therefore not active in the current app flow. Wire it only after the staging relay is deployed and validated.
- No PostgreSQL runtime execution of migrations, no Deno typecheck/deployment, no live Supabase two-account exchange, no physical Android/OPFS test, no account recovery or linked-device lifecycle validation.
- No production Supabase changes, Edge Function deployment, GitHub push, or Cloudflare deployment.
- Iteration 155 does not establish production-grade cryptographic assurance; it closes runtime lifecycle races and corrects active-device binding for returning browsers.
