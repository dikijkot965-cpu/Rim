# RIM 4.1.8 — Iteration 172

Date: 2026-11-22. Additive continuation from the Iteration 169 archive. No rollback to Iteration 144.

## E2E client integration

- Restored Open-E2EE Signal Protocol SDK 14.7.0 from the offline package archive. The vendored tarball is `vendor/open-e2ee-signal-protocol-sdk-14.7.0.tgz`; SHA-512:
  `kKJ0rn1Gxy1nXk3oYq4jVigmDUKcWlbpV7RmmSm8RrW7tRp0QJv01GHqIzHZdPm7WxqinoUgzMiBXB7qU/dB5w==`.
- Signal runtime is connected to the existing RIM Supabase relay and local message store. It records successful runtime start, Relay state, encrypted send, decrypt, peer-exchange success and failure events.
- Relay connection is not treated as E2E readiness. An encrypted challenge/ACK is required. `verifyScopeExchange` checks every participant in bounded batches and grants readiness only to the exact scope after all exchanges succeed.
- Readiness is cleared on stop/dispose and does not leak from a direct chat into another direct chat, group or private channel.
- Secret direct-chat header action verifies the full member list. Secret chats continue to be created with the existing `rim_create_secret_direct_chat` RPC.
- First protected text send can start incoming delivery and automatically run scope verification if all participants already have compatible registered devices. If a device is missing or unavailable, the send fails closed; plaintext is never used as fallback.
- Private group text uses Signal fan-out to each member and stores one local copy. Private channel text uses the same protected fan-out path with `scopeType='private_channel'`.
- Fixed private-channel local timeline subscription: the decrypted E2E event listener is now registered after the controller's `window` reference is assigned. Local channel history and incoming decrypted posts now update the feed.
- Timeline local E2E history is restricted to secret direct chats and E2E-required private groups. Public groups/channels are not treated as E2E scopes.
- Existing plaintext routes for unsupported E2E attachments/reactions/comments remain blocked; no unsafe plaintext fallback was added.

## Automatic E2E diagnostics

- Connected `E2EDiagnosticsReporter` to runtime, Relay, peer verification, send and decrypt events.
- Telemetry is bounded and excludes message text, ciphertext, private keys, tokens, envelopes and QR content.
- Production `rim_e2e_diagnostics` columns and RLS were checked: self insert/read plus superadmin read.
- Superadmin panel now automatically loads recent E2E diagnostics and supports manual refresh.
- The opt-in live lab remains available at `?rim-e2e-lab=1` and is separate from passive telemetry.

## Restored missing production SQL source

- Added `20261122160000_rim_iteration_172_e2e_secret_scope_reconcile.sql` containing production-backed definitions for `rim_create_secret_direct_chat`, `rim_e2e_activate_scope`, `rim_e2e_touch_scope`, `rim_e2e_touch_conversation`, and the secret-chat guard trigger.
- These definitions were retrieved from the active database using `pg_get_functiondef` because their original migration source was missing from the archive.
- This is a source-reconciliation file. It was **not applied** in this run because the functions and trigger already exist in production.

## Zladen

- Rewrote `docs/ZLADEN_FEATURE_MATRIX.md` to distinguish implemented source, production migration state and remaining Iris parity.
- Existing implementation includes profiles, permissions, moderation, reports, ranks, economy, shop/inventory/market, polls, games, triggers, clans and reminders.
- Live `rim-zladen` Edge Function remains ACTIVE v1; no new bot identity was provisioned.
- Production migration history does not contain Iterations 170 and 171. Their clan/reminder SQL remains source-only and was not applied. Full Iris parity is not claimed: webhooks, inline keyboards/callbacks, Business Mode, Mini Apps, fuller Bot Studio and full management UI remain outstanding.

## Production state

- Supabase project `xxvcsaomkyknudoaixbs` is `ACTIVE_HEALTHY`.
- `rim-e2e-relay` ACTIVE v2; `rim-e2e-device-link` ACTIVE v1; `rim-zladen` ACTIVE v1; all with JWT verification enabled.
- No production migrations were applied in this Iteration 172 run. No production device was enrolled.
- QR pairing UI, encrypted state transfer, multi-device history sync, per-device delivery/ACK recovery and live Supabase two-account/two-device proof are not complete.

## Verification

- `npm run check` — PASS: 124 mapped source modules, 24 legacy scripts.
- `npm run check:syntax` — PASS: 344 JavaScript files.
- `node --test --test-concurrency=1 tests/*.test.js` — PASS: 658 tests, 0 failures.
- `npm run test:e2e:relay` — PASS: 2 two-account Signal SDK/RIM relay adapter tests. These use an in-memory relay and memory store; logs correctly indicate that memory storage does not provide encryption at rest. This is not a live Supabase production test.
- `npm run build:cloudflare` — PASS: 167 Worker assets and 168 Pages-only assets built.
- Playwright browser E2E was not run; `@playwright/test` is not installed in this project.

## Important limitation

This iteration wires protected text send/receive for secret direct chats, private groups and private channels in source, but it does not prove a production deployment. Keep E2E readiness fail-closed until a live two-account/two-device Supabase test, restart recovery and ciphertext-only mailbox inspection pass.
