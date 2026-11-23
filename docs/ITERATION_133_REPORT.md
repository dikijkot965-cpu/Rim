# RIM 4.1.6 — Iteration 133 engineering report

## Scope

This iteration prioritised channel workflows, then introduced a first-party bot platform. Direct-message E2EE was researched and documented, but deliberately not enabled because no safe protocol integration was completed.

## Channels

- Channel post composer now accepts one image (JPG/PNG/WebP/GIF, up to 10 MiB) stored in the existing private `chat-files` bucket.
- Added post edit/delete controls for channel managers, using existing RLS ownership/manager checks.
- Added post-share deep links using `?channel=<uuid>&post=<uuid>` and app startup handling after sign-in.
- Added real join-request list with approve/reject actions backed by atomic `rim_channel_review_join_request` RPC.
- Added scheduled-post list, schedule form, cancel and publish-now actions.
- Publish-now is atomic via `rim_channel_publish_scheduled`; automatic time-based publishing is not enabled because there is no trusted scheduler configured in this iteration.
- Added bounded indexes for pending requests and scheduled queue.
- Existing channel pagination, reactions, polls, comments, pinned posts, media and links remain.

## Bot platform

- Added Bots workspace to the main navigation.
- Added create/list/rotate-token/revoke UI.
- `rim-bot-manage` v3 ACTIVE; JWT required. Creates dedicated Auth bot identities and profiles; owner quota 10.
- `rim-bot-api` v2 ACTIVE; bot bearer token authentication. Methods: `getMe`, `getUpdates`, `sendMessage`, `setMyCommands`.
- Bot tokens use 256-bit random entropy; only SHA-256 token digests are stored; token is returned once.
- `rim_bot_updates` queue is filled by a database trigger for human messages in conversations where the bot is a member. Bot-to-bot echo loops are excluded.
- `sendMessage` requires bot membership in the conversation and writes under the bot's own Auth identity.
- Durable per-bot limits: `sendMessage` 30/min, `getUpdates` 120/min, other API methods 60/min.
- Bot execution uses polling from an external developer runtime. RIM does not execute arbitrary user code inside its application. Webhooks, inline keyboards, callback queries, file APIs, mini-apps and a hosted sandbox are not yet implemented.

## E2EE decision

- No home-grown cryptographic protocol was shipped.
- RIM direct messages remain plaintext in the current schema. The docs explain why the legacy Signal JS implementation is archived and why current official libsignal is not a drop-in browser bundle.
- Matrix Rust crypto WASM is browser-compatible but implements Matrix protocol state and cannot simply be connected to the current Supabase `chat_messages` model by importing one crypto package.
- A real E2EE release still requires protocol selection, device/prekey directory, ratchet state persistence, verification, encrypted media, multi-device and adversarial tests, plus independent review.

## Supabase production changes

Applied migrations:
- `20261120220000` channel workflow RPCs and queue indexes
- `20261120221000` bot identity/update tables, RLS, trigger and service-role-only API RPCs
- `20261120222000` bot API durable rate limits and update offset semantics
- `20261120223000` prevent bot-to-bot echo update loops

Database checks confirmed the bot tables exist, bot API RPCs are not executable by `anon` or `authenticated`, and channel workflow RPCs are `SECURITY INVOKER` with authenticated execution only.

## Verification

- `npm run check:syntax`: PASS (289 JS files)
- `npm run check`: PASS (109 mapped modules)
- `npm test`: 445/445 PASS
- `npm run build:cloudflare`: PASS (149 Worker assets, 150 Pages-only files)
- `npm run audit:html`: 87 innerHTML sites, 11 REVIEW; dynamic bot UI values are HTML-escaped.
- Playwright E2E not run because Playwright is not installed.
- No bot account was created as a test fixture, and no real two-account bot chat was run. The backend schema and Edge Functions are deployed, but the first real bot lifecycle still needs a user-created test bot and chat.
- No Cloudflare production deployment was performed.
