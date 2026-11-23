# Current project snapshot — Iteration 174

Date: 2026-11-23. Base: verified full archive Iteration 173. Package version: `4.1.8-iteration.174`. Historical modular architecture includes iteration.97+; legacy scripts are not loaded as standalone script tags. No legacy UI redesign or unrelated feature work is included.

## E2E — implementation state

- Secret direct chats use `rim_create_secret_direct_chat` and are created with `is_secret=true`, `e2e_mode='required'`, and the `OPEN-E2EE-SP1` protocol profile.
- The Open-E2EE Signal Protocol SDK 14.7.0 is pinned in package metadata and retained as `vendor/open-e2ee-signal-protocol-sdk-14.7.0.tgz`. Runtime storage uses encrypted WebSQLite/OPFS where available, with an encrypted IndexedDB record fallback.
- Direct text uses pairwise Signal encryption, Supabase Relay delivery, encrypted peer challenge/ACK, and local device-only history. It fails closed; it does not insert plaintext into legacy message tables.
- Private groups and closed channels use pairwise Signal fan-out to each member. Public groups and public channels are not eligible. Channel E2E text publication bypasses `channel_posts`; local decrypted history/events render on each participant's device.
- Iteration 174 fixed a real SDK fan-out bug: the previous code reused one SDK timestamp for every recipient, causing Signal SDK to reject later sends. Each recipient now receives a unique monotonically increasing SDK send timestamp while the application payload retains the common message timestamp.
- E2E Live Lab (`?rim-e2e-lab=1`) now supports secret direct, private group, and private channel scopes. It requires the scope to already be `e2e_mode='required'`, confirms the actual member list, performs encrypted challenge/ACK against all members, then sends an explicit test message. It never activates a scope or changes ordinary chats.
- Diagnostics continue to store operational metadata only: event/status/code/latency/protocol and bounded metadata. No plaintext, ciphertext, private keys, tokens, or message bodies are sent to `rim_e2e_diagnostics`. The opt-in local Live Lab can display the decrypted test message to the signed-in tester.
- Unsupported E2E media, reactions, comments, bots, and legacy plaintext actions remain blocked rather than falling back to plaintext.

## Production Supabase state checked on 2026-11-23

Project `xxvcsaomkyknudoaixbs` is `ACTIVE_HEALTHY` (Postgres 17.11). Production migration history currently ends at `20261122171945` / Iteration 169. E2E migrations 136, 142, 143, 145, 149, 153, 154, 158, 160, 161, 162, 164, 165, 165a, 167, 168 and 169 are present.

The following production RPCs were queried and exist with `authenticated` EXECUTE and no `anon` EXECUTE: `rim_create_secret_direct_chat`, `rim_e2e_activate_scope`, `rim_e2e_get_scope_device_readiness`, `rim_e2e_request_scope_enable`, `rim_e2e_touch_scope`, `rim_e2e_touch_conversation`. Required scope columns exist on `conversations` and `channels`; `rim_e2e_devices` and `rim_e2e_diagnostics` exist. `rim-e2e-relay` is ACTIVE v2 with JWT verification enabled.

No production SQL migration or Edge Function was changed/applied during Iteration 174. Iteration 172's migration file is a source reconciliation of already-existing production RPC/trigger definitions; the database currently has the required RPCs, so do not apply it blindly. A read-only count query found 0 registered E2E device rows, 0 secret direct conversations, 0 E2E-required private groups, 3 private groups with E2E off, and 0 private channels with E2E required. No one should bulk-enable those groups before all members have compatible devices.

## Validation

- `npm run check`: PASS.
- `npm run check:syntax`: PASS.
- Full `npm test`: 662/662 PASS.
- Focused Signal SDK test: actual SDK encryption/decryption round-trip passes for two accounts; three-account private-group fan-out passes; three-account private-channel fan-out passes. Tests use an in-memory relay and test-only memory store, so they do not prove live Supabase or encryption-at-rest behavior.
- `node --test tests/manual-e2e-supabase-relay-two-account.mjs`: 2/2 PASS against its in-memory backend; despite the filename, this is not a live production Supabase test.
- `npm run build:cloudflare`: PASS; 167 Worker assets and 168 Pages-only files.
- Live production two-account/two-device exchange, browser restart recovery, and Android validation remain unperformed. Do not call E2E production-proven until those pass.

## Remaining limitations

- QR device pairing and encrypted identity/state transfer UI are incomplete. A second browser/device cannot safely inherit an existing account identity by simply registering a new device.
- Multi-device inbox fan-out, per-device delivery/ACK recovery, and encrypted history transfer are incomplete.
- E2E media, reactions, comments, and bot interactions are not implemented.
- The in-memory tests do not establish actual user-to-user delivery through production Supabase Relay.
