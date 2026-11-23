# RIM E2E engineering review — Iteration 157

Date: 2026-11-22  
Reviewed baseline: RIM 4.1.8 Iteration 156  
Result: additive Iteration 157 runtime lifecycle hardening

## Executive assessment

The E2E work is a substantial integration foundation, not a completed user-facing E2E system. The strongest part is the choice to use a maintained Signal Protocol SDK with required post-quantum/Braid configuration instead of treating the in-repo P-256/AES prototype as the production protocol. The relay has meaningful device ownership checks, prekey consumption controls, mailbox acknowledgement checks, idempotency, pagination and cancellation handling.

The largest remaining gap is end-to-end integration and verification, not a missing cipher primitive: incoming startup is not wired into the authenticated app lifecycle; no live Supabase/PostgreSQL two-account test exists; encrypted messages are not yet the sole integrated storage/read path for all direct-chat operations; and linked devices, recovery, groups and browser/Android persistence have not been exercised.

`protocolReady` must remain `false`.

## What is good

1. **Protocol selection:** `@open-e2ee/signal-protocol-sdk@14.7.0` is pinned and instantiated with `postQuantum: 'required'` and `braid: 'required'`. The application runtime does not silently fall back to the experimental in-repo crypto engine.
2. **Fail-closed state:** `protocolReady` is initialized and reset to false. Scope activation and encrypted sends are blocked while the protocol is not verified. This is the correct default.
3. **Relay boundary:** the browser adapter carries serialized ciphertext and public key material; privileged database RPC calls are mediated by an authenticated Edge Function. The Edge Function validates the caller JWT and checks ownership for device/key mutations.
4. **Device handling:** the runtime refuses to overwrite an already registered primary device when its local identity is absent. Device registration and peer prekey fetch are bound to the authenticated account/device.
5. **Prekey concurrency:** SQL uses row locking/`SKIP LOCKED` for one-time prekey claims, and the relay adapter serializes prekey publication plans per device/type.
6. **Mailbox safety:** relay delivery is deduplicated across Realtime and mailbox recovery; failed callbacks can be retried; acknowledgements are constrained to the registered active target device; mailbox recovery is paginated and now stops after unsubscribe.
7. **Lifecycle isolation:** account switches and disposal invalidate stale initialization work. Iteration 157 additionally coalesces concurrent incoming starts and serializes a retry behind disposal.
8. **Local data separation:** decrypted timeline records are explicitly marked local-only and the adapter comments prohibit routing them through ordinary server message mutations.
9. **Testing discipline:** SDK two-account PQ/Braid round-trip tests and relay contract tests exist; tests distinguish mocks from real Supabase verification.
10. **Scope control:** recent iterations are additive and do not alter unrelated chat UI, channel behavior or production database state.

## What is weak or unfinished

1. **No live server proof:** the passing relay round-trip uses an in-memory/mock backend. It proves the SDK-to-adapter contract, not SQL execution, Supabase Realtime behavior, Edge Function auth in deployment, or mailbox delivery against PostgreSQL.
2. **Incoming lifecycle is disconnected:** `RimSignalProtocolRuntime.startIncoming()` exists, but `src/app.js` only disposes the runtime on `SIGNED_OUT`; it does not start incoming delivery on an authenticated session. This is a real integration gap, not cosmetic cleanup.
3. **No safe multi-device linking:** primary-device protection is present, but there is no completed trusted-device approval/key transfer flow. A second browser cannot safely recover the existing identity merely by logging in.
4. **Recovery semantics are incomplete:** account recovery and key backup/restore are not end-to-end tested. A server-side account restore must not be mistaken for restoration of E2E identity or message history.
5. **Local cache key custody is limited:** `RimE2ELocalMessageStore` encrypts cached plaintext with WebCrypto AES-GCM, but its content `CryptoKey` is persisted in the same IndexedDB origin. This helps protect raw records from casual inspection, but it is not a strong boundary against same-origin script compromise/XSS or a fully compromised browser profile. Do not describe it as hardware-backed or equivalent to the SDK's encrypted protocol store.
6. **Experimental crypto is separate and must stay unused:** `src/security/e2e/crypto-engine.js` and `identity-vault.js` implement an experimental P-256/ECDH + AES-GCM path. It is not the Signal Protocol ratchet. In particular, `verifyDirectMessage()` verifies a key embedded in the payload rather than a previously trusted sender identity; by itself that proves possession of the embedded signing key, not the claimed sender's identity. Do not route production messages through this path without redesign and independent review.
7. **Message integration is partial:** `sendDirect()` can call the SDK and cache a local outgoing copy, but the app does not yet have a fully verified encrypted read/send lifecycle. Search, exports, notifications, reporting/moderation, bot/system paths, attachments and other plaintext surfaces need a complete inventory and policy decision.
8. **Group semantics are not done:** group membership changes, sender-key rotation, device-set changes, removals, and history policy need real protocol integration and tests. A direct-message round-trip does not prove group E2E.
9. **Platform persistence is unproven:** OPFS SQLite/Wasm asset packaging and IndexedDB fallback are present, but actual browser versions, multiple tabs, quota pressure, Android WebView/PWA behavior and crash recovery are not validated here.
10. **Operational validation is absent:** no Deno typecheck/deployment and no PostgreSQL migration execution were available in this environment. SQL static tests cannot replace runtime migration tests.

## Iteration 157 changes

- `startIncoming()` now returns the same in-flight promise to concurrent callers.
- Successful incoming startup is idempotent for the current client.
- SDK subscription startup is awaited and followed by account/runtime generation checks.
- Calls arriving during disposal wait for teardown and retry on the next runtime generation.
- Disposal detaches a pending startup promise; stale work cannot attach a subscription after it resumes.
- Added four regression tests: concurrent start coalescing, retry after subscription failure, and restart while old sync remains pending.
- Corrected stale `4.1.8-iteration.155` metadata in `package.json`, lockfile, module map, README and logger.

## Verification performed in this working generation

- ZIP integrity: PASS.
- Iteration 156 archive SHA-256: PASS; matches the Library checksum file.
- SDK 14.7.0 entrypoint import: PASS using the existing offline bootstrap artifact.
- SDK browser stores: both expected entrypoints present.
- `npm run check`: PASS — 121 mapped source modules, 24 legacy scripts.
- `npm run check:syntax`: PASS — 328 JavaScript files.
- `npm test`: PASS — 616/616.
- `npm run test:e2e:relay`: PASS — 1/1 SDK PQ/Braid relay-contract round-trip with mock backend. Output warns that the mock store has no at-rest encryption.
- `npm run audit:html`: completed — 93 sites: 14 REVIEW, 24 OK, 55 STATIC.
- `npm run build:cloudflare`: PASS — 164 Worker assets and 165 Pages files.
- Deno/PostgreSQL/Supabase CLI runtime validation: unavailable in this environment.

## Next engineering sequence

1. Provision or explicitly authorize isolated Supabase/PostgreSQL staging. Never use production as a substitute.
2. Apply migrations 135, 136, 142, 143, 145, 149, 153 and 154 in order to a disposable database; inspect constraints, policies, function grants, indexes and query plans.
3. Typecheck the `rim-e2e-relay` Edge Function with the deployed Deno/Supabase runtime and test every action under authenticated, wrong-owner, inactive-device and malformed-input cases.
4. Deploy only to staging and run two independent real accounts with separate browser profiles. Verify prekey fetch, ciphertext-only mailbox rows, Realtime, pull, ack, duplicate delivery, offline recovery and sign-out.
5. Wire `startIncoming()` to a single authenticated-session lifecycle owner only after staging validation. Ensure session changes dispose old client/store/relay before new account startup.
6. Integrate encrypted direct-chat send/read into the actual conversation repository/timeline without plaintext fallback; prove server message rows contain no plaintext.
7. Complete device linking/revocation and account recovery semantics before advertising multi-device E2E.
8. Test browser OPFS and fallback, Android WebView/PWA, multi-tab locking, storage quota and restart recovery.
9. Audit attachments, search, exports, notifications, reports/moderation, bots and system messages; explicitly define what is unavailable or metadata-only in E2E scopes.
10. Only then revisit `protocolReady`; do not set it true from SDK startup or mock tests.

## Deployment boundary

No production Supabase, GitHub, or Cloudflare changes were made. No SQL migrations were applied. No workflow was triggered. Iteration 144 remains excluded.
