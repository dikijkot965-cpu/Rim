# RIM 4.0.0 — iteration 6 report

Date: 2026-11-14

## Scope

Consolidate conversation list state without changing the imperial UI. Move sorting, unread counters, last-message projection, read cursor writes and chat-list Realtime out of legacy wrappers into the application layer.

## Implemented

- Added `src/application/conversation-state-controller.js`.
- Added repository methods for batched read-cursor retrieval, exact unread counts, latest-message lookup and read-cursor upsert.
- Conversation ordering now uses Realtime activity, persisted `last_message_at`, then conversation creation time, with deterministic ID tie-break.
- Unread read-state rows are fetched in one request. Exact counts are performed with bounded concurrency (default six simultaneous requests), replacing the previous sequential per-chat count loop.
- Unread badges are rendered by `ConversationListController`, preserving the existing `.feature-count` visual class.
- Chat-list Realtime now updates last-message preview, activity order and unread count for inactive conversations. UPDATE/DELETE events reconcile the latest preview when the changed message was the latest known message.
- Mark-read writes now store the timestamp of the newest loaded message rather than `Date.now()`, avoiding marking messages that arrived after the loaded page as read.
- Both `loadMessages` and the actual legacy `rimLoadMessagesStable` entry point use the same modular timeline and mark-read flow.
- Realtime subscriptions are disposed on sign-out and application lifecycle disposal.
- Removed the fully unused `01-rim-halloween-ornaments-2026-11.js` script and its HTML reference. The existing CSS hides `#rimHalloweenOrnaments` globally, so this removal does not alter the rendered UI.
- Removed duplicate global message-ordering Realtime and wall-clock read-state writes from `assets/js/core/rim-core-release.js`. The remaining presence, typing, voice, music and channel-settings functionality remains in place.

## Legacy retirement achieved

Three duplicate responsibility blocks were removed from legacy scripts:

1. `03-legacy-03.js`: old unread-counter wrapper and sequential query loop.
2. `16-rim-release-patch-2026-11.js`: old last-activity sorting wrapper.
3. `25-rim-stability-consolidated-20261105.js`: old chat-list message Realtime subscription and its initializer wrapper.

**Important:** 24 legacy script files remain and are still referenced by `index.html`; one obsolete file was fully deleted. The remaining files have NOT all been deleted because they still contain required product features. The safe goal is to migrate each responsibility, verify parity, remove its old implementation, then remove a script only when it contains no required functionality.

## Performance and limitations

The former unread-count code awaited one exact-count request after another. It now retrieves all read cursors in one query and runs exact per-conversation counts with a bounded worker pool. This reduces serialized waiting, but it still performs one count request per conversation. A grouped aggregate RPC could reduce this further, but that requires a reviewed database function and production migration; none was applied.

Initial conversation preview remains dependent on persisted conversation fields and Realtime updates. A bounded, reliable per-conversation latest-message bootstrap is still a future task; no unsafe bulk scan was added.

## Verification

`npm run verify` passed:
- Project check: 39 JS files discovered; local HTML assets resolved.
- Syntax check: 64 JavaScript files passed.
- Node tests: 68 passed, 0 failed.
- Added tests for activity ordering, preview formatting, bounded unread-count concurrency, stale refresh protection, read cursor timestamp, inactive/active conversation behavior, and legacy responsibility retirement.

No real Chromium/Android E2E, two-account test, live Supabase latency benchmark or load test was run. No production SQL, RLS, Storage, Auth or data changes were applied. The visual UI and CSS were not redesigned or modified. `index.html` changed only to remove the obsolete decorative script reference.

## Next

- Migrate outgoing read-receipt/tick rendering from legacy `25` and `06` into a dedicated application feature without changing the tick UI.
- Audit channel and group script responsibilities to identify further safe legacy retirements.
- Replace per-conversation unread count calls with a reviewed aggregate database function only after schema/RLS review.
- Add latest-message bootstrap and ensure initial preview is correct without full message-history scans.
- Continue removing legacy script tags only when their remaining functions have complete modular replacements and integration coverage.
