# RIM 4.0.0 — Master Engineering Instruction and Execution Specification

**Project:** Русский Императорский Мессенджер (RIM)  
**Baseline:** user-supplied `RIM_3.1_SOURCE.zip` / RIM 3.1.0  
**Target:** RIM 4.0.0  
**Work type:** internal codebase modernization and behavioral repair only  
**Non-goal:** redesign, rebranding, UI reskin, replacement with a new product

---

## 0. Mission statement

Re-engineer the existing RIM application into a maintainable, testable, secure, observable and scalable messaging product while preserving its current visual identity and user-facing interaction model.

The work is not complete when a new architecture exists. It is complete only when the existing product's user-visible capabilities have been inventoried, migrated or deliberately retained behind a controlled adapter, behaviorally verified, and packaged as a deployable full project.

The source of truth is the supplied RIM 3.1.0 archive. Never substitute a generic messenger, a mockup, a static demo, or a simplified clone.

### Required deliverables

1. A complete RIM 4.0.0 project archive, not a partial patch.
2. A migration specification and architecture documentation.
3. A feature parity matrix mapping every legacy capability to its new owner and tests.
4. Database migration SQL that is additive, reviewable and safe to apply.
5. Unit, integration, security-policy, and browser-level tests to the extent the environment permits.
6. A repeatable build/verify pipeline.
7. A release report that distinguishes verified, partially verified, and externally blocked work.
8. A rollback and deployment guide.

## 1. Non-negotiable preservation contract

### 1.1 Files that are frozen unless a specific technical necessity is demonstrated

The initial migration must preserve byte-for-byte:

- `index.html` visual markup and all existing user-facing element IDs.
- `assets/css/rim.css`
- `assets/css/rim-architecture.css`
- `assets/images/**`
- `icons/**`
- existing fonts, icons, images, theme assets and visual resources.
- `manifest.json` appearance-related metadata, except a narrowly scoped correctness fix that does not alter the visible design.

The current HTML has 40 distinct IDs. Treat every ID, `data-*` hook, inline action hook, form name, and CSS class used by scripts as a compatibility contract until the replacement is proven.

### 1.2 Prohibited changes

Do not:
- redesign screens, navigation, chat list, message bubbles, profile, settings, channels, groups, writer, music, favorites, admin, or dialogs;
- change colors, typography, font weights, spacing, radii, dimensions, iconography, button placement, panel order, animation, or responsive breakpoints;
- remove a feature because its code is difficult to understand;
- replace a working flow with an alert, placeholder, TODO, fake data, local-only simulation, or disabled button;
- silently change permissions, visibility defaults, data retention, or user expectations;
- change database table names or columns without a migration and compatibility plan;
- claim production readiness, security, or a concurrency capacity that has not been tested.

### 1.3 Allowed changes

Internal code may be reorganized completely: module boundaries, service layers, repositories, state management, event handling, data loading, caching, error handling, validation, build tooling, tests and deployment configuration.

A visual change is allowed only if it is a bug fix necessary to restore the existing intended appearance. Record it in the visual regression report and prove that it does not constitute a redesign.

### 1.4 Visual regression gate

Before changing runtime behavior:
- capture the existing screen states at the same viewport sizes;
- record screenshots for signed-out, sign-up, signed-in home, chat list, direct chat, group chat, channel, profile, settings, favorites, Lite Writer, music, admin and modal states;
- record desktop and narrow Android viewport behavior;
- inventory computed styles and DOM structure for key components;
- establish screenshot comparison thresholds and manually review all diffs.

After every migration slice, repeat the same scenarios. If the environment has no real browser or device, mark visual E2E as blocked; do not infer a pass from static inspection.

## 2. Source baseline and known facts

The supplied archive contains:
- `index.html`, `manifest.json`, `package.json`, CI workflow and project scripts;
- two CSS files and image/icon assets;
- Supabase browser core script;
- 25 ordered classic scripts under `assets/js/legacy/`;
- modular runtime under `src/`;
- SQL scripts and documentation;
- Node tests.

Baseline verification executed successfully:
- `npm run check`
- `npm run check:syntax`
- `npm test`
- 27 tests passed, 0 failed.

This verifies only the existing automated checks. It does not verify real browser behavior, live Supabase permissions, two-account flows, Android keyboard behavior, realtime load, or production capacity.

### 2.1 Existing modular layer

Current modules include:
- `src/core/`: result, errors, event bus, container, logger, health, config, disposable scope;
- `src/domain/`: conversation and music statistics;
- `src/application/`: conversation header resolution, conversation list controller, legacy entrypoint registry;
- `src/infrastructure/supabase/`: conversation repository;
- `src/features/`: favorites workspace, Lite Writer, local music;
- `src/compatibility/`: legacy bridge;
- `src/app.js`: composition root.

Do not assume this layer is complete merely because folders exist. Audit actual imports, dependencies, behavior and tests.

### 2.2 Existing legacy feature inventory

The 25 scripts currently include the following discovered function groups. Names are evidence for inventory, not a complete semantic specification; inspect call sites and runtime behavior before migrating.

**Authentication and core messaging (02):**
`signIn`, `signUp`, `signOut`, `initializeApp`, `loadProfile`, `loadSettings`, `saveSettings`, `loadConversations`, `conversationTitle`, `renderConversationList`, `filterChats`, `openConversation`, `backToChats`, `loadMessages`, `getProfiles`, `renderMessages`, `renderMentions`, `subscribeToMessages`, `sendMessage`, `messageKeydown`, `resizeComposer`, `setReply`, `cancelReply`, `editMessage`, `deleteMessage`, `reactToMessage`, `toggleStickers`, `sendSticker`, `sendImage`, `newDirectChat`, `newGroupChat`, `findUserByName`, `showUserProfile`, `startChatWith`, `openProfile`, `saveProfile`, `openSettings`, `applyTheme`, `applyLanguage`, `changeTheme`, `changeLanguage`, `openChatInfo`, `addGroupMember`, `loadChannels`, `createChannel`, `openChannel`, `publishChannelPost`, `reactToPost`, `uploadMusic`.

**Imperial cabinet, notifications, bulletin, reports, moderation and channel enhancements (03):**
role/profile loading, notification badge and read state, cabinet/member cards/achievements, bulletin board and moderation, report submission and resolution, wallpaper preferences and uploads, pin/unpin/jump-to-message, read state, channel comments, profile/channel customization, channel edit/delete/post edit/delete, push subscription and notification settings.

**Workspace and navigation (04, 05):**
workspace open/data/persist/list/back/welcome, full-page navigation, close page, navigation insertion and active state, more/tools pages.

**Playlists, privacy, group avatars (06):**
playlist loading, privacy settings, group avatar projection.

**Seasonal/navigation compatibility (01, 08, 09):**
Halloween ornament mount, ad cleanup, navigation ordering/observer, seasonal preferences, topic toolbar and topic labels.

**Feature startup and attachments (10, 13):**
feature bootstrap, page opener, attachment control.

**Reports/context and restoration patches (11, 12):**
inspect every side effect, global override and database assumption; do not infer behavior from filenames.

**History and performance (14, 15):**
performance patch; newest/older history fetch, older-page loading and scroll binding.

**Favorites, Lite Writer, local music, ads and typing (16, 18, 21, 24):**
favorites rows and documents, writer HTML sanitation, document list/load/save/autosave, local audio import/play/delete, audio database, ad destination normalization, typing broadcasts, stable music loading/rendering.

**Channel management and profile rendering (17, 19):**
admin channel controls, member rows, channel profile projection, channel ads/destinations, full channel rendering.

**Groups (20):**
inspect complete script, event handlers, selectors and Supabase calls; map all behaviors even where no top-level named functions were found.

**RIM ID and admin (22, 23):**
RIM ID connection requests, admin user loading, RIM ID request handling, advertising and analytics.

**Stability/consolidation (25):**
favorites row normalization, storage path cloning, chat-list realtime binding and read-state realtime binding.

Also inspect `assets/js/core/rim-core-release.js`, inline scripts in HTML, all inline event attributes, dynamically injected styles, observers, timers, `window` properties and database calls. Function-name extraction alone is not enough.

## 3. Engineering principles

1. **Behavior before refactor:** characterize existing behavior before replacing it.
2. **Vertical slices:** migrate one complete user capability at a time, including UI controller, use case, repository, authorization and tests.
3. **Single ownership:** each business rule and state transition has one authoritative implementation.
4. **Explicit dependencies:** no new module reads mutable globals or reaches into another feature's private state.
5. **Domain isolation:** domain rules do not import DOM, Supabase, browser globals or legacy code.
6. **Infrastructure boundaries:** all Supabase operations live in repositories/adapters, not scattered through UI handlers.
7. **Composition root:** construct dependencies in one place and inject them.
8. **Lifecycle ownership:** every subscription, listener, observer, timer, abort controller and channel has an owner and deterministic cleanup.
9. **Bounded data:** every potentially unbounded query is paginated or explicitly capped.
10. **Secure by default:** server-side authorization and RLS are authoritative; hiding a button is not authorization.
11. **Observable failures:** errors are structured, logged safely and surfaced to users in understandable language.
12. **No false completion:** tests and external dependencies are reported honestly.

## 4. Target architecture

Recommended structure (adapt names to the actual codebase; do not create empty ceremony):

```
src/
  app/
    bootstrap.js
    composition-root.js
    routes.js
  core/
    result.js
    errors.js
    event-bus.js
    container.js
    logger.js
    health.js
    config.js
    disposable-scope.js
    clock.js
    ids.js
    validation.js
  domain/
    identity/
    conversation/
    message/
    group/
    channel/
    notification/
    report/
    moderation/
    advertising/
    music/
    writer/
    privacy/
  application/
    auth/
    conversations/
    messages/
    groups/
    channels/
    profiles/
    notifications/
    reports/
    moderation/
    favorites/
    writer/
    music/
    admin/
    rim-id/
    advertising/
  infrastructure/
    supabase/
      client.js
      repositories/
      realtime/
      storage/
      mappers/
    browser/
      indexed-db/
      clipboard/
      notifications/
  features/
    auth/
    chat-list/
    conversation/
    group/
    channel/
    profile/
    settings/
    notifications/
    reports/
    favorites/
    writer/
    music/
    admin/
    rim-id/
    ads/
  presentation/
    dom/
    controllers/
    adapters/
  compatibility/
    legacy-adapter.js
    legacy-contracts.js
tests/
  unit/
  integration/
  contract/
  browser/
  security/
```

Only create modules that own actual behavior. Avoid splitting a simple function into multiple abstractions without a concrete benefit.

### 4.1 Dependency direction

- Domain depends on nothing outside domain/core value primitives.
- Application depends on domain and repository/service interfaces.
- Infrastructure implements application-facing ports.
- Features/presentation call application use cases; they do not query Supabase directly.
- Composition root wires implementations.
- Compatibility layer is the only code permitted to understand legacy global names during migration.
- No dependency cycle is allowed.

### 4.2 State ownership

Create explicit stores/controllers for:
- authenticated session and profile;
- active conversation and selected view;
- paginated message window;
- chat list and unread/read state;
- group/channel membership and metadata;
- notification state;
- UI preferences (theme/language) while preserving existing options;
- admin session/permissions;
- local drafts and offline queue.

Avoid duplicating the same mutable state in `window`, module variables, DOM attributes and Supabase caches. DOM is a projection of state, not the authoritative database.

### 4.3 Event contract

Define typed/documented events, payload schemas and lifecycle:
- `auth:session-changed`
- `auth:signed-out`
- `profile:updated`
- `conversation:opened`
- `conversation:closed`
- `conversation:list-updated`
- `message:created`
- `message:updated`
- `message:deleted`
- `message:reaction-changed`
- `message:read-state-changed`
- `typing:changed`
- `group:updated`
- `channel:updated`
- `notification:received`
- `report:updated`
- `runtime:disposed`

Events must not carry secrets or entire mutable service objects. Document event ownership, ordering, retry semantics and whether delivery is synchronous or asynchronous.

## 5. Feature-by-feature migration requirements

Each feature must have: characterization tests, domain rules if applicable, use case, repository contract, Supabase adapter, presentation controller, loading/empty/error states, authorization review, telemetry and tests.

### 5.1 Authentication and session lifecycle
- Preserve current sign-in, sign-up, sign-out and onboarding screens.
- Validate form input and normalize errors without exposing sensitive provider details.
- Subscribe once to Supabase auth state changes.
- On sign-out/account switch: abort pending requests, dispose user-scoped realtime channels, clear user-scoped caches, clear private UI, cancel typing, revoke local object URLs and reset active view.
- Prevent stale responses from a previous account rendering after a new account signs in.
- Never store service-role credentials in browser code.
- Test session refresh, expired session, duplicate auth events, sign-out during upload, and account switching.

### 5.2 Profiles and identity
- Preserve profile fields and visible presentation.
- Batch profile lookups; avoid N+1 requests.
- Respect profile privacy projection and visibility settings.
- Validate usernames and profile edits server-side where possible.
- Cache only safe public projections with bounded TTL and invalidation.
- Test missing profile, deleted account, private profile, changed avatar and stale avatar URL.

### 5.3 Conversation list and direct chats
- Preserve list ordering, unread indicators, names, avatars and existing click behavior.
- Define deterministic conversation title/peer resolution.
- Use stable IDs, not display names, for identity.
- Paginate if the list can grow; debounce search.
- Realtime updates must update only affected rows and must not reorder incorrectly.
- Test two-person, group, missing-member, blocked user, archived/deleted conversation, stale request and rapid switching.

### 5.4 Message history and rendering
- Replace unlimited in-memory history with cursor pagination using a stable compound cursor such as `(created_at, id)`.
- Fetch newest page first; load older pages on demand.
- Use bounded cache and DOM virtualization/windowing for long histories while preserving scroll anchoring and message grouping.
- Never append the same message twice when optimistic send and realtime echo race.
- Preserve replies, edits, deletes, reactions, stickers, attachments, mentions, pins, read markers and timestamps.
- Escape untrusted text and sanitize allowed rich content. Never inject raw user HTML.
- Test 1, 100, 1,000 and 10,000-message histories, scroll restoration, duplicate realtime echo, out-of-order events, deleted messages and malformed payloads.

### 5.5 Message sending
- Validate text and attachment constraints.
- Use client-generated idempotency keys where schema/backend permits.
- Keep optimistic UI reversible: pending → sent or failed; retry must not duplicate.
- Serialize or safely coordinate concurrent sends per conversation.
- Handle offline/timeout/retry with bounded exponential backoff and jitter.
- Do not retry permanent authorization/validation failures.
- Test double tap, flaky network, response timeout after server commit, realtime echo before request response and account switch during send.

### 5.6 Realtime
- Centralize channel creation and ownership.
- Subscribe only to data relevant to the current user and active view.
- Reuse channels where appropriate; prevent duplicate subscriptions.
- Every subscription has deterministic unsubscribe and scope disposal.
- Handle reconnect, auth refresh, channel error, duplicate/out-of-order events and visibility changes.
- Coalesce bursts; do not block rendering with unbounded event queues.
- Avoid broadcasting private content to broad public channels.
- Measure active channels per session, reconnect frequency, event rate, dropped/coalesced events and handler duration.

### 5.7 Groups
- Preserve group creation, member addition, group avatars, info, roles and existing group UI.
- Enforce membership and role permissions in database policies or trusted server functions.
- Prevent unauthorized member enumeration and metadata modification.
- Define leave/remove/ownership transfer semantics before implementation.
- Test creator, admin, ordinary member, removed member, non-member and simultaneous membership changes.

### 5.8 Channels and posts
- Preserve channel creation, profile, posts, comments, reactions, subscriptions/followers, channel wallpaper, ads and channel-to-group links where present.
- Distinguish owner/admin/moderator/subscriber permissions.
- Ensure public/private channel visibility is enforced server-side.
- Paginate posts/comments and avoid unbounded follower counts.
- Test unauthorized publishing/edit/delete, subscription transitions, deleted channels and realtime fan-out.

### 5.9 Read state, unread counts and typing
- Read receipts must be scoped to conversation membership and privacy settings.
- Avoid writing a database row for every scroll pixel; debounce and batch read markers.
- Typing is ephemeral, rate-limited, short-lived and never persisted as message content.
- Clear typing on timeout, blur, navigation, sign-out and disconnect.
- Test multiple devices, offline transitions and privacy toggles.

### 5.10 Replies, edits, deletes, reactions, pins, mentions and stickers
- Preserve all current UI controls and workflows.
- Validate ownership and permissions in backend policies.
- Define edit/delete windows and historical semantics based on existing product behavior; do not invent a new policy.
- Reactions must be idempotent per user/message/reaction.
- Pins require membership/role authorization.
- Mentions must not execute HTML or create arbitrary links.
- Test concurrent edits, repeated reaction toggles and stale message references.

### 5.11 Attachments and media
- Preserve image/file attachment UX.
- Validate MIME type, extension, byte size and storage path; never trust client-supplied MIME alone.
- Use private buckets and short-lived signed URLs for private content.
- Enforce per-user/per-feature quotas and cleanup abandoned uploads.
- Make upload + metadata creation compensating: if metadata write fails, remove orphan object where safe.
- Do not expose storage object paths as authorization.
- Test upload cancellation, retry, invalid file, quota, signed URL expiry and account switching.

### 5.12 Favorites and workspace
- Preserve favorites, saved items, workspace navigation and persistence.
- Ensure each user's records are isolated.
- Handle deleted source messages/files gracefully.
- Prevent duplicate favorites and stale references.
- Test persistence across reload and multiple devices where cloud-backed.

### 5.13 Lite Writer
- Preserve editor appearance, document list, formatting, count, selection and autosave behavior.
- Supabase remains primary when schema/policy is available; local fallback must be explicit and recoverable.
- Never silently make local-only data appear cloud-synced.
- Add a visible state using existing visual conventions for local-only, syncing, saved and failed states; do not redesign the editor.
- Serialize saves, prevent duplicate inserts, use optimistic concurrency/version fields if schema supports it.
- Provide safe migration/retry of local documents to cloud and prevent data loss on account switch.
- Sanitize HTML with a strict allowlist.
- Test rapid edits, offline save, reload, two tabs, conflict, missing table and migration failure.

### 5.14 Music and playlists
- Preserve music library, local import, playlists, playback, statistics and existing privacy/visibility behavior.
- Validate audio metadata and storage quota.
- Use object URL lifecycle cleanup.
- Handle missing/deleted tracks and interrupted playback.
- Avoid unbounded media downloads and duplicate audio fetches.
- Test import failure, storage failure, playback errors, playlist persistence and statistics correctness.

### 5.15 Notifications and push
- Preserve in-app notification list, badge, mark-read and settings.
- Respect permission state and user preferences.
- Do not request browser permission unexpectedly.
- Ensure notification payloads do not expose private message text on lock screens unless existing explicit preference allows it.
- Test duplicate delivery, revoked permission, signed-out state and read synchronization.

### 5.16 Reports, moderation and bulletin board
- Preserve report submission, report context, moderation queue, resolution and bulletin board flows.
- Validate report target and prevent arbitrary object access.
- Record moderation actions with actor, timestamp, target and reason.
- Apply role authorization server-side.
- Avoid exposing reporter private data to unauthorized users.
- Test reporter, moderator, ordinary user and malformed report references.

### 5.17 Admin panel
- Preserve all existing admin sections and actions.
- Audit every admin query and mutation.
- Admin status must come from trusted server-side claims/roles, never a client-editable profile flag alone.
- Every action must be authorized in RLS or Edge Function.
- Add audit log for bans, mutes, role changes, report resolution, ad changes and RIM ID actions.
- Require confirmation for destructive operations while retaining existing UI conventions.
- Test ordinary user denial, admin allowed, expired admin session and direct API invocation bypassing UI.

### 5.18 RIM ID
- Preserve existing RIM ID connection/request flows and separate the identity ecosystem from messenger UI.
- Define identity mapping, account linking, unlinking, collision handling and recovery.
- Never trust a client-provided user ID as proof of identity.
- Use server-verified tokens/claims and short-lived authorization.
- Test duplicate link, wrong account, expired request, replay and unlink.

### 5.19 Advertising and analytics
- Preserve ad destinations, placements and admin controls.
- Validate and normalize URLs; allow only explicitly supported schemes.
- Prevent `javascript:`, `data:` and malformed URL injection.
- Avoid collecting unnecessary personal data.
- Aggregate analytics server-side where practical; never fetch all messages/users to calculate counts.
- Test URL validation, unauthorized admin changes and empty/large datasets.

### 5.20 Themes, languages and seasonal effects
- Preserve all currently available theme/language options and their behavior.
- Fix persistence and pre-login preference restoration without changing the design.
- Ensure missing translations have deterministic fallback and do not render raw keys.
- Seasonal/Halloween effects must never cover controls, block input, steal focus or break navigation.
- Test narrow viewport, keyboard open, reduced motion and theme switching.

### 5.21 PWA and navigation
- Preserve installability and existing routes/relative deployment behavior.
- Audit manifest paths, icons and service worker caching if present.
- Do not cache private API responses or user-specific pages in a shared cache.
- Ensure app updates do not strand old clients with incompatible assets.
- Test root deployment and subpath deployment.

## 6. Supabase and database engineering

### 6.1 Schema discovery before SQL changes
Read every existing SQL file and enumerate all tables, columns, indexes, foreign keys, triggers, functions, buckets and RLS policies. Compare these with every `.from()`, `.rpc()`, Storage and Realtime call in the source.

Do not invent schema based on naming. The live project may differ from checked-in SQL.

### 6.2 Migration policy
- Migrations are additive by default.
- Use explicit transaction boundaries where supported.
- Use idempotent DDL when safe.
- Do not drop or rename existing columns in the same release as client migration.
- Backfill in bounded batches.
- Add indexes concurrently where platform permits.
- Document rollback and irreversible operations.
- Include preflight checks and post-migration verification queries.
- Never apply migrations to production from this build environment.

### 6.3 RLS review
For each table, document:
- anonymous access;
- authenticated select/insert/update/delete;
- row ownership and membership constraints;
- admin/moderator privileges;
- cross-user data isolation;
- Storage object authorization;
- Realtime publication exposure.

Tests must use at least two separate users and prove that one cannot read or mutate the other's private data. UI tests alone do not count.

### 6.4 Query and index policy
- No unbounded `select('*')` for high-volume tables.
- Use explicit projection.
- Index actual filter/order predicates, especially conversation membership and message cursors.
- Inspect query plans for representative workloads.
- Use cursor pagination, not large offsets, for message history.
- Define retention/archival only after product requirements are established.

### 6.5 Secrets
Only publishable/anon client keys may be in the browser, protected by RLS. Service role, signing secrets and privileged tokens must never enter HTML, JS bundles, source maps or repository history.

## 7. Performance and capacity

### Client
- Keep initial interactive path small.
- Load feature code on demand only when safe and beneficial.
- Cache bounded data with explicit invalidation.
- Virtualize long message lists without scroll jumps.
- Avoid repeated DOM scans and forced synchronous layout.
- Batch profile and attachment resolution.
- Abort stale requests.
- Clean object URLs, observers, timers and subscriptions.
- Measure startup, route transitions, message render and memory under long sessions.

### Backend
- Model separately: registered accounts, daily active users, simultaneous sessions, active Realtime sockets, messages/sec, media egress and peak sign-in bursts.
- Define target SLOs before testing.
- Load test a staging project, never production.
- Report p50/p95/p99 latency, error rate, reconnect rate, database saturation and cost drivers.
- 10,000 concurrent users is a target to validate, not a promise that frontend refactoring can guarantee.
- Introduce a separate fan-out/pub-sub service only if measurements and provider limits justify it; do not add distributed infrastructure speculatively.

## 8. Security requirements

- Treat all user input, database rows, Storage metadata and external URLs as untrusted.
- Escape text and sanitize rich HTML with an allowlist.
- Prevent XSS, injection, open redirects and unsafe URL schemes.
- Avoid `innerHTML` with untrusted data.
- Use least privilege for all data access.
- Enforce role and membership checks server-side.
- Apply rate limits to auth-sensitive, message, report, upload and RIM ID operations.
- Do not leak access tokens, signed URLs, private message content or personal data to logs.
- Use correlation IDs that do not contain secrets.
- Define CSP compatible with current app; remove unnecessary third-party script trust where feasible.
- Pin dependency versions and audit dependencies.
- SRI may be used for stable external resources; for application-critical libraries prefer pinned/self-hosted bundled dependencies where deployment supports it.
- Document threat model and residual risks.

## 9. Reliability and concurrency

For every async operation:
- define timeout/abort behavior;
- define retryability;
- define idempotency;
- define stale-response handling;
- define cleanup;
- define user-visible failure behavior.

Test races:
- switch chat while history loads;
- sign out during pending request;
- account switch during avatar resolution;
- send two messages rapidly;
- realtime echo before send response;
- reconnect and duplicate event delivery;
- autosave while switching documents;
- delete source while it is favorited;
- upload object succeeds but metadata write fails;
- admin role changes while admin panel remains open.

## 10. Testing strategy and gates

### 10.1 Unit tests
Pure domain rules, mappers, validators, cursor construction, idempotency, event contracts, state transitions and error normalization.

### 10.2 Integration tests
Repositories against a controlled Supabase-compatible test environment or well-defined adapter mocks. Mocks must verify query shape and error handling, not merely return canned success.

### 10.3 Contract tests
Assert that repository queries, table/column names, RPC arguments, storage bucket names and expected policy behavior match the checked-in schema contract. Live schema drift must be documented.

### 10.4 Browser E2E
Use two independent test accounts. Cover:
- sign up/sign in/sign out;
- direct conversation and group conversation;
- message send/edit/delete/reply/react;
- attachments;
- channels/posts/comments/reactions/subscriptions;
- profile/settings/theme/language;
- notifications/read state/typing;
- favorites/workspace;
- Lite Writer create/edit/autosave/reload;
- music import/playlists;
- reports/moderation/admin/RIM ID where test credentials permit.

### 10.5 Visual regression
Compare baseline screenshots at identical viewport, theme, data and font-loading state. Any changed pixels in frozen areas require investigation.

### 10.6 CI
Every pull/build must run:
- dependency install from lockfile;
- formatting/lint/type checks if configured;
- project integrity checks;
- syntax/build checks;
- unit tests;
- integration/contract tests;
- browser tests where runner permits;
- dependency/security audit.

No green CI claim if a step is skipped; report skipped steps.

### 10.7 Release gates
A release candidate is blocked if:
- any existing feature is unaccounted for;
- a critical path is replaced with a placeholder;
- unauthorized access test fails;
- data migration can destroy existing data;
- visual regression is unexplained;
- there are unhandled promise rejections;
- build fails;
- rollback artifact is missing.

## 11. Migration execution order

### Phase 0 — Baseline and forensic inventory
- Extract the supplied archive.
- Run all existing checks.
- Hash frozen visual assets.
- Inventory HTML IDs/classes/data hooks and inline handlers.
- Map every global function, event listener, timer, observer, storage call, Supabase query, Storage operation and Realtime subscription.
- Read all SQL and docs.
- Produce feature parity matrix and risk register.

**Exit:** complete inventory; no code deletion.

### Phase 1 — Build foundation
- Pin runtime and dependencies.
- Add deterministic build and lockfile.
- Establish lint/type policy consistent with actual code.
- Make CI reproducible.
- Add module map validation and duplicate detection.
- Add test utilities and browser harness.

**Exit:** clean reproducible build; baseline behavior unchanged.

### Phase 2 — Runtime and session ownership
- Centralize Supabase client construction.
- Add auth session manager.
- Add lifecycle scopes and abort handling.
- Replace broad global context with narrow compatibility adapters.
- Introduce typed event contracts.
- Ensure account switch/sign-out fully disposes private state.

**Exit:** no new module reads mutable legacy globals; auth lifecycle tests pass.

### Phase 3 — Core messaging vertical slice
- Implement message repository and domain model.
- Add cursor pagination and bounded cache.
- Add deduplication/idempotency and optimistic state.
- Add message list rendering adapter and virtualization.
- Preserve existing DOM contract and visual layout.

**Exit:** direct chat behavior parity and long-history tests pass.

### Phase 4 — Conversation list, profiles and identity
- Complete batched identity projection.
- Add cache invalidation and privacy projection.
- Remove duplicate profile lookup paths.
- Add stale response tests.

**Exit:** list and header identity parity.

### Phase 5 — Realtime
- Central subscription manager.
- Per-user/per-conversation scopes.
- Reconnect and backpressure/coalescing.
- Remove duplicate legacy realtime bindings after parity.

**Exit:** channel count bounded and cleanup verified.

### Phase 6 — Groups and channels
- Migrate membership, roles, posts, comments, subscriptions and metadata.
- Apply policy tests.
- Preserve channel/group presentation.

**Exit:** role matrix and two-account E2E pass.

### Phase 7 — Supporting messaging features
- Replies, edits, deletes, reactions, pins, mentions, stickers, read state, typing, attachments and uploads.
- Add failure recovery and cleanup.

**Exit:** all controls have tested behavior and authorization.

### Phase 8 — User features
- Profiles, settings, notifications, favorites, workspace, Lite Writer, music, playlists and privacy.
- Migrate local fallback safely.
- Verify account isolation and persistence.

**Exit:** feature parity matrix complete for user features.

### Phase 9 — Admin, reports, moderation, ads and RIM ID
- Server-authoritative permissions.
- Audit logs.
- Secure URL validation.
- RIM ID linking semantics.
- Admin E2E with test roles.

**Exit:** no client-only authorization; privileged operations tested.

### Phase 10 — Legacy retirement
- For each migrated vertical slice, remove old implementation only after parity tests.
- Remove obsolete script tags and globals incrementally.
- Keep a minimal adapter only where genuinely required.
- Do not delete a script wholesale if it contains a feature not yet mapped.

**Exit:** no feature implementation remains duplicated; legacy folder removed or contains only explicitly documented adapters.

### Phase 11 — Performance, security and release hardening
- Profile startup and long histories.
- Run security tests and dependency audit.
- Review RLS and Storage policies.
- Run staging load tests.
- Fix measured bottlenecks.
- Verify PWA deployment paths.

**Exit:** all release gates pass or remaining external blockers are clearly listed.

### Phase 12 — Packaging
- Generate complete source archive.
- Include `index.html`, unchanged CSS/assets, source modules, SQL, docs, tests, package files and CI.
- Exclude secrets, `.env` values, `node_modules`, temporary logs and test credentials.
- Include checksum/manifest and release notes.
- Verify archive can be extracted and built from a clean directory.

## 12. Feature parity matrix format

Maintain `docs/FEATURE_PARITY_MATRIX.md` with one row per capability:

| Capability | Legacy source | New owner | Data contract | UI hook | Tests | Status |
|---|---|---|---|---|---|---|
| Sign-in/sign-up | legacy 02 | auth use cases | auth/profile | existing IDs | unit + E2E | pending |
| Direct messages | legacy 02/15 | message feature | messages/conversations | existing chat DOM | integration + E2E | pending |
| Groups | legacy 02/20 | group feature | group tables | existing group UI | policy + E2E | pending |
| Channels | legacy 02/03/17/19 | channel feature | channel tables | existing channel UI | policy + E2E | pending |
| Lite Writer | legacy 16/24 + src feature | writer feature | writer documents | existing writer UI | race + persistence | partial |
| Local music | legacy 16/21 + src feature | music feature | storage/local DB | existing music UI | import/playback | partial |
| Admin/RIM ID | legacy 22/23 | admin/identity | roles/requests | existing admin UI | authorization | pending |

Expand the matrix to every discovered control and action. `pending` is not a completed status. Allowed statuses: `not inventoried`, `characterized`, `in progress`, `implemented`, `verified`, `blocked external`. A feature is `verified` only when the relevant tests passed.

## 13. Definition of Done

RIM 4.0.0 is done only when all conditions below are satisfied:

- [ ] All existing user-facing features are inventoried.
- [ ] Every feature has an explicit owner and parity status.
- [ ] No feature was silently removed.
- [ ] Existing visual assets and UI contract are preserved.
- [ ] No unexplained visual regression remains.
- [ ] New modules do not depend on mutable legacy globals.
- [ ] Supabase access is behind repositories/adapters.
- [ ] Auth changes dispose user-scoped resources.
- [ ] Messages use bounded cursor pagination.
- [ ] Long message lists do not create unbounded DOM.
- [ ] Realtime subscriptions have bounded ownership and cleanup.
- [ ] Optimistic sends are idempotent and recoverable.
- [ ] Storage upload failures clean up orphaned objects where safe.
- [ ] RLS and Storage policies are reviewed and tested with two users.
- [ ] Admin authorization is server-enforced.
- [ ] Writer local fallback is explicit and recoverable.
- [ ] No secrets are present in the client bundle or archive.
- [ ] Unit, integration and contract tests pass.
- [ ] Browser E2E passes for supported scenarios.
- [ ] Android viewport and keyboard scenarios are checked.
- [ ] Performance results include methodology and p50/p95/p99.
- [ ] Capacity statements match actual staging test results.
- [ ] CI is reproducible from a clean checkout.
- [ ] Rollback and deployment instructions exist.
- [ ] Complete archive is extracted and verified independently.

## 14. Mandatory reporting format

At the end of each engineering iteration report:
1. files changed;
2. behavior migrated or fixed;
3. visual files changed (must normally be none);
4. tests added;
5. commands executed and exact results;
6. database assumptions and SQL not applied;
7. remaining legacy dependencies;
8. known defects and risks;
9. external blockers;
10. next concrete implementation step.

Never write “done”, “secure”, “production-ready”, “fully migrated” or “supports N concurrent users” unless the evidence in this report supports that exact claim.

## 15. Execution discipline

This document is the controlling instruction for implementation. Work must proceed in concrete code changes, not endless architecture commentary.

Do not stop after writing this specification. Continue with the next bounded engineering task, run checks, inspect failures, fix them, and package the complete project state available in the environment. If a requirement cannot be completed without external credentials, live database access, browser/device access or a missing product decision, implement the safe local portion, mark the external verification as blocked, and state precisely what is needed.

The goal is not maximum code volume. The goal is a complete, coherent, testable product with preserved behavior and no fabricated claims.
