# RIM CURRENT STATUS

**Version:** 4.1.4-iteration.131  
**Date:** 2026-11-20  
**Authority:** This file supersedes older status reports when they conflict.

## Iteration 129 notes

- Independent 256-bit recovery pepper generated inside Supabase Vault. New phrase/code hashes use version 3; legacy version 1 remains verifiable.
- Added strict seed-only foundations: Custom Access Token Hook, `supabase_auth_admin`-scoped policies, per-session authorization table, restrictive RLS gate on 88 public tables, Storage objects and Realtime messages, and two-phase activation RPCs. In iteration 130 the Hook was connected and `rim-account-security` deployed as v12. In iteration 131 readiness was deliberately returned to `false` pending real-account E2E; no account is seed-only.
- Fixed message UPDATE/DELETE RLS to require sender ownership and current conversation membership.
- Added 54 missing FK indexes, removed 5 redundant indexes and 14 exact duplicate RLS policies; converted 136 direct `auth.uid()` policy calls to cached subselects. Performance advisor now shows 0 unindexed-FK and 0 auth-initplan findings; 36 intentional/under-review permissive-policy warnings remain.
- Channel feed now has stable cursor pagination and pinned posts; channel feed index added.
- Radio expanded with more Russian-language stations, favourites, sleep timer and bounded reconnect.
- Added optional local PIN/pattern app lock. It is explicitly not server-side account authentication.
- Supabase org is on Free plan; built-in leaked-password protection is unavailable until Pro or higher.
- Iteration 130 verification: 435/435 unit tests pass; 108 mapped modules; syntax check passes across 287 JavaScript files; Cloudflare build passes. Playwright E2E is skipped because Playwright is unavailable; two-account, physical Android and load tests remain pending.
- `rim-push` v4 is deployed with sender/chat/channel context; VAPID secrets are still required. See `docs/PUSH_NOTIFICATIONS_SETUP.md`.
- Admin dashboard now shows database and Storage measurements, bucket breakdown, largest tables, public table count and a 30-day active-user estimate.

## Iteration 128 notes

- Recovery Edge Function is ACTIVE at version 7; password readiness is now read from `auth.users.encrypted_password` through a service-role-only RPC.
- Seed phrase UI explains use, safe storage, loss/rotation and security boundaries; creation requires three random word confirmations. Phrase can be created later in Privacy settings after skipping onboarding.
- Current phrase format remains RIM v1: 184-bit entropy + checksum; not BIP-39. Strict seed-only sign-in is intentionally not enabled until server-side auth hook and session/RLS gates are complete. See `docs/SEED_ONLY_AUTH_DESIGN.md`.
- Radio catalogue expanded with Russian stations and category/search controls; HLS fallback is used for HLS streams.
- Channel directory gained category chips; existing cards/search/subscription state remain.
- Supabase grant hardening applied: 0 anonymous-executable `SECURITY DEFINER` functions; all 88 public tables have RLS enabled. 50 authenticated-executable definer functions remain with `auth.uid()` checks; advisor still reports generic warnings for these and leaked-password protection disabled.
- Unit tests: 407/407 pass. Playwright E2E, two-account auth, physical Android and production load tests remain pending for the reasons in `RELEASE_NOTES_2026-11-20.md`.

## Iteration 127 notes

- Added RIM-only 24-word account recovery phrase with 184 bits of random entropy, checksum validation, server-side HMAC storage, one-time redemption, and rate limiting. It is explicitly not BIP-39.
- Existing recovery codes preserve their v1 HMAC derivation and remain compatible.
- New-account security onboarding offers cloud-password creation only when no email/password identity exists, plus a one-time recovery phrase prompt.
- Admin user rows now show identity providers and security readiness flags only; plaintext passwords and recovery phrases are never exposed.
- Music gained cloud-backed play/completion/listening-time statistics, seven-day activity, top tracks/artists, and a persistent embedded SomaFM radio player.
- Channel directory gained signed avatars, search, category/date labels, subscription status and responsive card layout.
- Supabase migration `20261120184000_rim_security_music_admin_hardening` applied and new admin RPCs verified with an administrator claim.
- At the time of iteration 127 the Edge Function deployment was pending. Iteration 128 subsequently deployed the source as active version 7.
- Iteration 127 test baseline: architecture PASS (107 modules), syntax PASS (280 files), tests PASS (403/403); Playwright E2E skipped because `@playwright/test` is not installed.
- Cloudflare build: 147 Worker assets and 148 Pages-only files.
- Full verification and remaining manual checks are recorded in `docs/ITERATION_127_ENGINEERING_REPORT.md`.

## What is true now

- Modular architecture is the primary runtime path (`src/app.js` + composition surfaces).
- `index.html` loads: Supabase CDN (pinned), `rim-primitives.js`, `rim-runtime-bootstrap.js`, `rim-core-release.js`, `src/app.js` (module).
- The historical `assets/js/legacy/*.js` **tree still exists on disk** but is **not loaded** by `index.html` (Stage C).
- Automated gate: `npm run verify` → architecture map + syntax + unit/integration tests.
- Browser HTML smoke files exist under `tests/` but are **not** part of `npm run verify` yet.

## Architecture layers

| Layer | Path | Role |
| --- | --- | --- |
| Bootstrap shim | `assets/js/rim-runtime-bootstrap.js` | Auth session, lexical globals, dual-bind fallbacks |
| Composition | `src/composition/*` | Wires controllers to DOM + window entrypoints |
| Application | `src/application/*` | Use-cases / controllers / command services |
| Infrastructure | `src/infrastructure/supabase/*` | Repositories |
| Core | `src/core/*` | Container, Result, events, html escape |
| Features | `src/features/*` | Favorites, Lite Writer, etc. |

## Iteration 126 notes

- Telegram OIDC: canonical public URL `https://dikijkot965-cpu.github.io/Rim/` on GitHub Pages host + meta tag.
- Docs: `docs/TELEGRAM_AUTH.md` (must match Supabase `TELEGRAM_REDIRECT_URI` secret).

## Iteration 125 notes

- Fixed the previous archive root problem: all repository files now sit at ZIP root; Cloudflare can find `package.json`, `wrangler.jsonc`, and the build script from `/`.
- Build generates `cloudflare-pages/` as a separate static-only Pages upload root with no Wrangler config, package manifest, TypeScript, or Supabase backend files.
- Pages Git configuration: Root `/`, Build command `npm run build:cloudflare`, output `cloudflare-pages`. Manual upload: contents of `cloudflare-pages/` only. Optional no-build mode uses root `/cloudflare-pages`, empty build command and output `.`.
- Workers Builds configuration: Root `/`, Build `npm run build:cloudflare`, Deploy `npm run deploy:wrangler`.
- Added 10 one-time recovery codes with HMAC digests, service-role-only storage, atomic consumption, and Supabase session issuance. Migration applied; `rim-account-security` deployed. `RIM_RECOVERY_PEPPER` is optional; when absent, the function derives its HMAC key from the server-only service-role key using HKDF.

## Iteration 124 notes

- Cloudflare build is explicit and allowlisted: `npm run build:cloudflare` creates `dist/` from browser-only files.
- Supabase Edge Function TypeScript, migrations, tests, docs, and SQL are excluded from the public asset directory.
- `wrangler.jsonc` points static Worker assets to `./dist`; `npm run deploy:cloudflare` builds first and invokes pinned Wrangler 4.165.0.
- Pages and Workers Builds use different settings; see `docs/CLOUDFLARE_DEPLOYMENT.md`.
- Added automated tests for asset isolation and Wrangler configuration.

## Iteration 123 notes

- Outbox flush can send without active chat match; skips rate policy; options pass-through.

## Iteration 121 notes

- Connection status domain + controller (online/offline/reconnecting) on chat header.
- Honest product posture: architecture ≠ product-market proof.

## Iteration 120 notes

- Domain delivery statuses (queued/sending/sent/read/failed) in message meta ticks.
- Read receipts sync delivery context into MessageListRenderer.

## Iteration 119 notes

- Outbox pending rows visible in message list («⏳ в очереди»).
- verify runs soft Playwright e2e (skip if not installed).

## Iteration 118 notes

- Offline outbox domain + MessageOutboxService (localStorage, online flush).
- Network-failed text sends enqueue; `rimFlushOutbox` / online listener.

## Iteration 117 notes

- Domain send-policy (interval + burst); MessageCommandService enforces on text/sticker send.

## Iteration 116 notes

- Domain membership roles; group setRole normalizes via domain.
- Message edit uses normalizeMessageBody.
- core-release sendVoice defers when voice owned.

## Iteration 115 notes

- Domain `channel` rules; create/publish validate via domain.
- core-release skips presence when modular own-presence owns it.
- check-project guards src/ innerHTML review budget.

## Iteration 114 notes

- rim-core-release dual-binds channel settings + music to modular owners.
- CURRENT_STATUS debt list aligned with bootstrap ~250 LOC reality.

## Iteration 113 notes

- Google OAuth: `#googleAuthBtn`, `AuthFormController.signInWithGoogle`, docs/AUTH_GOOGLE.md.
- Bootstrap dual-bind `signInWithGoogle`.

## Iteration 112 notes

- Bootstrap ≤400 achieved (~249 LOC compacted dual-bind shim).
- Playwright skeleton: `playwright.config.mjs`, `tests/e2e/smoke.spec.mjs`, `npm run test:e2e` (skips if not installed).

## Iteration 111 notes

- Bootstrap compacted helpers/sections/start/mirror; ~428 LOC (near 400 target).

## Iteration 110 notes

- AppBootstrapController owns initializeApp.
- Bootstrap dual-bind stubs compacted; ~587 LOC.

## Iteration 109 notes

- Auth UX in bootstrap compacted; dual-bind to AuthFormController first.
- signOut / loadProfile thinned.
- Bootstrap ~707 LOC.

## Iteration 108 notes

- ProfileRepository + win.getProfiles from conversation session surface.
- Viewport early listeners only when modular viewport not owned.
- Bootstrap ~775 LOC.

## Iteration 107 notes

- Theme/language changeTheme/changeLanguage stubs; thinner applyTheme/applyLanguage.
- backToChats dual-bind ownership flag.
- Bootstrap ~793 LOC.

## Iteration 106 notes

- ComposerChromeController: keydown, resize, stickers, attach sheet.
- ViewportController: visualViewport + --app-height.
- Bootstrap ~816 LOC.

## Iteration 105 notes

- NavigationSectionController owns showSection.
- Bootstrap stubs: loadConversations, openConversation, sendMessage.
- Bootstrap ~839 LOC.

## Iteration 104 notes

- ShellModalController owns showModal/closeModal (`__RIM_MODAL_OWNED`).
- Direct-chat surface owns showUserProfile + startChatWith/findUserByName stubs in bootstrap.
- Bootstrap ~878 LOC.

## Iteration 103 notes

- AppearancePreferencesService.loadFromServer + ProfileController.ensureProfile.
- Bootstrap dual-binds loadProfile/loadSettings/saveSettings/applyTheme/applyLanguage.
- Bootstrap ~907 LOC.

## Iteration 102 notes

- Bootstrap ~936 LOC: chat-info, group member, music upload/load, signOut dual-bind stubs.
- `__RIM_MUSIC_OWNED` + loadMusic/uploadMusic via LocalMusicLibrary.
- Domain: `music-track` validation rules.

## Iteration 101 notes

- Bootstrap ~984 LOC: profile/channels create/load/publish classic fallbacks stubbed.
- ChannelFeedController owns publish + react; globals `rimPublishPost` / `rimReactChannelPost` wired.
- Production path: fewer dual code paths for channels.

## Iteration 100 notes

- Conversation domain is the single source for activity sort, titles, previews.
- ConversationStateController + ListController consume domain helpers.
- Classic `renderConversationList` fallback stubbed (modular paint owns DOM).

## Iteration 99 notes

- Bootstrap: classic `loadMessages` / `renderMessages` / `subscribeToMessages` fallbacks retired to stubs (modular timeline owns path).
- Domain: conversation sort/filter helpers; username validation.
- ComposeChatService validates usernames via domain.
- `docs/PRODUCTION_ROADMAP.md` — levels L0–L6 toward public release.

## Iteration 98 notes

- Domain: `message` body/image rules, `auth-credentials` validation.
- Application: `AuthFormController` owns login/register UX; bootstrap dual-binds when `__RIM_AUTH_FORM_OWNED`.
- MessageCommandService delegates body normalization to domain.

## Known technical debt (ordered)

1. Bootstrap shim done (~250 LOC) — dual-bind residual only; prefer modular owners.
2. `rim-core-release.js` still holds presence/music/voice compatibility paths — dual-bind when owners exist.
3. Inline HTML handlers (`onclick=`) — migrate gradually to module listeners.
4. Domain layer still thinner than ideal — expand membership/channel rules.
5. Playwright skeleton exists but not in default `verify` / CI.
6. SQL migrations incomplete in-repo — live Supabase is system of record today.
7. Server-side scale (Realtime, RLS, indexes) not load-tested.
8. Product UX regressions (composer/channels TG parity) need live dual-account QA on modular owners.

## Security baseline

- Publishable Supabase key only in client (no service role in repo).
- Prefer `escapeHtml` / `escapeAttr` from `src/core/html.js` for new UI strings.
- Run `node scripts/audit-innerhtml.mjs` before large HTML surface changes.

## Next engineering priorities

1. Continue bootstrap reduction without UI contract breaks.
2. Playwright smoke: login, open chat, send, switch chat, channel open.
3. Expand domain models (message, channel, membership rules).
4. Reproduce critical SQL + RLS in `sql/migrations/`.
5. Functional product work on top of modular owners (channels/DM UX, radio, etc.).

## Test posture

- Unit/integration: required green on every iteration.
- Headless smoke: recommended when touching navigation/messaging.
- Live Supabase QA: required before calling a release "production-ready".


## Honest product posture

- Client architecture is modular and test-backed; that is real engineering progress.
- This is **not** yet proof of a public messenger that “works for everyone”.
- Monetization, Play Store survival, and multi-million scale are unproven.
- Priority remains: reliable UX on modular owners, e2e proofs, then growth talk.


## Iteration 123 additions

Telegram OIDC PKCE adapter and server-side identity exchange are included; provider secrets and the exact Telegram redirect URI must be configured in Supabase Edge Function Secrets. Offline outbox records are now user-partitioned and replay sends use database-backed client_message_id idempotency.


## 2026-11-20 — Iteration 130
- `rim-account-security` Edge Function deployed as version 12. Custom Access Token Hook is connected in the Dashboard; SQL privilege checks and a non-seed smoke test passed; readiness flag is now true. No user account has seed-only enabled automatically.
- Seed-only activation uses the two-phase begin/password-rotation/activate flow. The short 12-word RIM format is available alongside the 24-word format.
- `rim-push` Edge Function deployed as version 2. Push delivery is implemented for messages, but requires VAPID secrets from the project owner before subscriptions and sends can succeed.
- Admin dashboard includes measured database and Storage usage, object/bucket counts, and Free-plan reference quotas.
- Channel pinned items now jump to their corresponding post.


## Iteration 131 — push context and channel profile

- Push notifications now include sender/chat/channel names and bounded message/post previews, with per-user `show_message_preview` control. Channel publication triggers push delivery. `rim-push` deployed as version 4; VAPID secrets still required.
- Unified the app on `/service-worker.js`. Added local browser VAPID generator at `tools/vapid-keygen.html` and updated Android setup guide.
- Channel profile read model now includes exact member/manager counts and distinct administrator quick actions; subscriber view does not expose management controls. Reaction/vote rendering uses pre-grouped maps.
- Seed-only readiness is intentionally `false` until a real test account completes the full login/refresh/disable test matrix. No user account is seed-only.
