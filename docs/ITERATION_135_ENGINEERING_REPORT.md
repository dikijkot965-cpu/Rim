# RIM 4.1.8 — iteration 135 engineering report

## Priorities

1. Bot code workspace and real isolated execution architecture.
2. E2E key-directory/crypto groundwork without false production claims.
3. Forward-looking SQL schema for social feed and personalization.

## Bot changes

- Removed the explicit 1 MB source-file rejection from the editor.
- Editor source now persists to Supabase project/file rows rather than only localStorage.
- Added multi-file import, project file listing, file switching, create-file action, explicit save, autosave, source snapshots, and start/stop requests.
- Added runtime status metadata and owner-only runtime log access.
- Added owner-checked `rim_bot_request_runtime` RPC.
- Added `bot-runtime/` Node 22 container service using `isolated-vm`, a restricted `RIM` facade, per-isolate memory limits, execution timeout, read-only container, dropped capabilities, and non-root user.

**Important:** the container service is not deployed. A persistent host and server-side secrets are required. The Run action queues a desired state only. User code does not execute until the runtime container is deployed and connected. Current runtime limits: one instance, up to 8 bots, one JS entry file, no npm modules, no unrestricted network, no webhooks/inline callbacks/files/Mini Apps.

## E2E changes

- Extended identity generation to include P-256 ECDH and ECDSA signing identities.
- Added signed-prekey generation and verification.
- Added one-time prekey generation.
- Updated local vault to persist non-extractable CryptoKeys and prekey material in IndexedDB.
- Added `E2EDeviceRepository` to publish public device keys and claim verified prekey bundles.
- Added sender signature to the experimental envelope.
- Added Supabase tables for devices, signed prekeys, one-time prekeys, key-change events, plus atomic prekey-claim RPC.

**Important:** not a production E2E protocol. No Double Ratchet, no message-path integration, no forward secrecy for a sequence of messages, no post-compromise recovery, no multi-device fanout, and no independent audit. Existing chats remain unchanged and plaintext/server-readable.

## SQL foundation

Applied additive schema in the live Supabase project:
- 5 bot workspace/runtime tables (in addition to existing 3 bot tables).
- 28 feed tables, including threaded comments, reactions, polls, revisions, collaborators, moderation queue, ranking config, recommendation cache, topic follows, suppressions and author aggregates.
- 6 user preference/event tables.
- 4 E2E device/key directory tables.
- `feed_posts` extended with title, language, topics, publication/edit/pin/labels/soft-delete metadata.
- 14 initial feed taxonomy topics inserted using localization keys.

RLS is enabled on the new tables. Bot project writes are owner-scoped. Runtime state/logs and version snapshots are not user-writable. Prekey bundle claim is SECURITY DEFINER, authenticated-only, checks user blocks, and consumes a one-time prekey atomically.

## Automated verification

- `npm run check`: PASS — 112 mapped source modules.
- `npm run check:syntax`: PASS — 294 JavaScript files.
- `npm test`: PASS — 462/462.
- `npm run build:cloudflare`: PASS — 152 Worker assets and 153 Pages-only files.
- `npm run test:e2e`: skipped because `@playwright/test` is not installed.
- `npm run audit:html`: 92 `innerHTML` sites (24 OK, 54 static, 14 REVIEW). The review findings are listed by the audit; they are not asserted safe without manual inspection.
- Docker runtime build: not run because Docker is unavailable in this environment; `isolated-vm` is not installed in the local Node test environment.

## Validation still required

- Deploy container runtime on a persistent host and run a real bot end-to-end.
- Test multi-file source saving and source version restore.
- Run full browser E2E and physical Android tests.
- E2E key registration and claim need two real accounts/devices.
- Do not activate E2E in message sending.
- Review feed RLS against real private/followers-only posts before connecting UI.
- Add cleanup/retention jobs for bot logs, feed events, impressions, and consumed prekeys.

## Continuation order

1. Deploy and smoke-test `bot-runtime/` on a controlled host.
2. Add runtime leases/multi-instance scheduling and per-bot state storage.
3. Add commands, inline keyboard, callback queries, webhook and file methods.
4. Complete reviewed X3DH + Double Ratchet design and test suite before E2E integration.
5. Build feed repositories and ranking pipeline against `docs/SOCIAL_FEED_SCHEMA.md`.
6. Keep localization keys and separate theme tokens; do not hard-code user-visible strings into business logic.
