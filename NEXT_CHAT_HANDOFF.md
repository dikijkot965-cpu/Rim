# RIM Iteration 174 handoff — 2026-11-23

## Package provenance
- Continued from verified `RIM_4.1.8_ITERATION_173_DIRECT_E2E.zip`.
- Package version: `4.1.8-iteration.174`.
- Preserved the existing modular RIM architecture and UI; no unrelated UI overhaul.
- SDK 14.7.0 restored from the existing offline bootstrap archive for local validation; source archive retains the pinned vendor tarball, not `node_modules`.

## Work completed
1. Fixed Signal SDK group/channel fan-out timestamp collision. Every pairwise recipient send now receives a unique monotonic SDK timestamp; the encrypted application payload keeps one common message timestamp.
2. Added actual SDK-backed three-account tests for private group fan-out and private channel fan-out. Each participant receives and decrypts the message into its local timeline; relay envelopes contain ciphertext and no plaintext body.
3. Expanded `?rim-e2e-lab=1` to test secret direct chats, private groups, and closed channels. The lab requires `e2e_mode='required'`, checks the real membership roster, runs encrypted challenge/ACK with every participant, and then sends an explicit test message. It does not enable E2E or alter ordinary chats.
4. Added UI wiring coverage for the expanded laboratory.
5. Updated package/module/app versions and current status documentation.

## Production Supabase inspection (read-only)
- Project `xxvcsaomkyknudoaixbs`: `ACTIVE_HEALTHY`, Postgres 17.11.
- Migration history ends at Iteration 169. Relevant E2E migrations 136, 142, 143, 145, 149, 153, 154, 158, 160, 161, 162, 164, 165, 165a, 167, 168 and 169 are present.
- RPCs present with authenticated EXECUTE and anon denied: secret direct creation, scope activation/request, device readiness, scope touch and conversation touch.
- `rim_e2e_devices`, `rim_e2e_diagnostics`, `conversations.e2e_mode/is_secret/is_private`, and `channels.e2e_mode/is_public` exist.
- `rim-e2e-relay` is ACTIVE v2, JWT verification enabled.
- Current read-only counts: 0 registered E2E device rows; 0 secret direct conversations; 0 E2E-required private groups; 3 private groups with E2E off; 0 private channels with E2E required. Do not bulk-enable existing groups while members lack devices.
- No production SQL or Edge Function was changed in this iteration. Do not apply Iteration 172 reconciliation blindly: its required RPCs are already present in production.

## Verified checks
- `npm run check`: PASS (124 mapped modules; 24 legacy scripts).
- `npm run check:syntax`: PASS (344 JavaScript files).
- `npm test`: 662/662 PASS.
- Focused Signal SDK test: 3/3 PASS (two-account direct; three-account private-group fan-out; three-account private-channel fan-out).
- `node --test tests/manual-e2e-supabase-relay-two-account.mjs`: 2/2 PASS with in-memory adapter backend.
- `npm run build:cloudflare`: PASS (167 Worker assets, 168 Pages-only files).

## Test boundary
- The Signal SDK direct/group/channel tests use a test-only in-memory relay and memory store. They prove SDK encryption/decryption and RIM fan-out behavior, not real production delivery. Memory store intentionally logs that it has no encryption at rest; production runtime selects encrypted WebSQLite/OPFS or encrypted IndexedDB fallback.
- `tests/manual-e2e-supabase-relay-two-account.mjs` uses an in-memory backend behind the actual `SupabaseSignalProtocolRelay` adapter; it is not a live Supabase test.
- Do not claim production E2E is proven until two real authenticated RIM accounts exchange a message through the live Relay, the recipient decrypts it, and both devices survive restart/recovery checks.

## User test procedure after deploying the ZIP
1. Deploy the new repository version through the existing GitHub → Cloudflare workflow. No Supabase migration is required for the code change in this iteration; the current production RPCs/schema were checked.
2. On two separate authenticated RIM accounts/devices, create/open the secret direct chat. Both clients must run the new build and initialize their primary E2E device.
3. In the secret chat, use the lock/verification action. It must complete encrypted challenge/ACK with both participants before any protected message is sent.
4. Test text in both directions. Confirm the recipient's local timeline receives/decrypts it and the sender sees local history.
5. For private groups, open the private group and use the E2E activation/verification control. Every member must have a registered compatible device. For a closed channel, use the channel's E2E setup action as an authorized manager. Public groups/channels are excluded.
6. Open the app with `?rim-e2e-lab=1` to use the expanded laboratory. Select the scope type, paste the scope UUID, and send a test after the scope is already `required`. The lab shows local decrypted receipt; the superadmin diagnostics view shows metadata-only events.
7. Send the exact test time, scope type, result/error text, and diagnostic event rows (not message keys or tokens) back for analysis.

## Remaining work
- Complete QR device linking and encrypted state transfer.
- Implement multi-device inbox fan-out, per-device delivery/ACK recovery and encrypted history transfer.
- Add encrypted media/reactions/comments only after the text protocol is stable.
- Perform live production two-account and Android tests.
