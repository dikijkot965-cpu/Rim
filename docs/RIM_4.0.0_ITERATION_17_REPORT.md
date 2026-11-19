# RIM 4.0.0 — Iteration 17 report

**Release:** `4.0.0-iteration.17`  
**Base:** `RIM_4.0.0_CONTINUATION_2026-11-15_ITERATION_16.zip`

## Objective

Move active-conversation state ownership out of the principal legacy opener and harden message-history pagination and Realtime subscription behavior during rapid conversation switching. Preserve the existing UI and Supabase schema.

## Implemented

### 1. Application-owned conversation selection

Added `src/application/conversation-navigation-controller.js`.

- Issues monotonically increasing navigation tokens.
- Rejects commits from stale navigation requests.
- Rejects a conversation object whose ID does not match the requested ID.
- Commits the active conversation through an injected state setter.
- Clears the reply target through an injected state setter and invokes the existing reply UI reset callback.
- Supports invalidation on sign-out and deterministic disposal.

The explicit compatibility boundary in `index.html` now exposes `setActiveConversation` and `setReplyTarget` closures for the legacy lexical state. `createLegacyBridge` exposes these setters to application code. The principal legacy opener now begins a navigation token and delegates the active-conversation/reply-target state commit to the controller. Its existing DOM rendering, CSS classes, loading path, group settings button, avatar behavior and analytics remain in place.

A compatibility fallback remains for cases where the modular runtime has not installed the new bridge functions.

### 2. History pagination concurrency

Hardened `MessageTimelineController`:

- Tracks in-flight older-page requests per conversation instead of using one global lock.
- Switching chats no longer blocks pagination in the newly active chat while an older request from the previous chat is pending.
- A stale older-page response still cannot mutate the new chat's timeline because the existing timeline generation and active-conversation checks remain authoritative.
- The pagination loading indicator now reflects only the active conversation's request.
- The scroll container is injected/resolved safely, so controller tests do not depend on a browser global.
- Page size is clamped to 1–200 to avoid unbounded query requests.

### 3. Realtime subscription race protection

- Added a subscription-request sequence independent of the subscription epoch.
- Channel detachment clears the current channel reference before awaiting removal.
- After asynchronous channel removal, a pending subscription rechecks both its request token and the currently active conversation.
- A stale request cannot attach a Realtime channel after a newer conversation has won navigation.
- Public `unsubscribe()` invalidates pending subscribe requests, including sign-out and teardown paths.

### 4. Tests

Added navigation-controller tests for commit, stale token rejection, mismatched IDs, invalidation and disposal. Added timeline tests for per-conversation pagination locks, stale Realtime subscription requests and bounded page size. Added legacy integration assertions for state delegation and the compatibility setters.

## Files changed

- `src/application/conversation-navigation-controller.js` (new)
- `src/application/message-timeline-controller.js`
- `src/compatibility/legacy-bridge.js`
- `src/app.js`
- `index.html` (compatibility state setters only; no visual markup or styling changes)
- `assets/js/legacy/24-rim-architecture-rebuild-2026-11-05.js`
- `tests/conversation-navigation-controller.test.js` (new)
- `tests/conversation-open-legacy-integration.test.js`
- `tests/message-timeline-controller.test.js`
- `package.json`
- `scripts/check-project.mjs`
- `RIM_MODULE_MAP.json`
- `docs/ARCHITECTURE.md`
- `docs/OPEN_CONVERSATION_LEGACY_TRACE.md`
- `NEXT_CHAT_HANDOFF.md`
- `BUILD_INFO.txt`
- `README.md`
- `docs/RIM_4.0.0_ITERATION_17_REPORT.md` (new)

## Verification

`npm run verify` completed successfully:

- Project integrity: PASS — 34 source modules mapped; 24 legacy scripts remain.
- Syntax: PASS — 93 JavaScript files.
- Node tests: PASS — 156 passed, 0 failed.

No real browser/device E2E run is claimed. No live Supabase request, production migration, RLS change or load test was performed.

## UI and data safety

- CSS files and image assets are unchanged from iteration 16.
- The `index.html` change is limited to two setter functions in the existing non-visual legacy context object.
- No Supabase schema, data, policies, Auth or Storage changes were made.
- Existing DOM rendering remains in the legacy opener.

## Remaining work

- The legacy opener still owns substantial DOM and screen-lifecycle behavior; this iteration migrates active-state commitment, not the entire opener.
- Browser-level two-chat rapid-switch tests are still required before retiring additional wrappers.
- Typing/presence subscriptions and their ownership need a separate audit.
- 24 legacy scripts remain; no script was deleted in this iteration.
- No claim is made that RIM is production-ready or certified for 10,000 concurrent active users.

## Next recommended work — iteration 18

1. Build a browser-level test harness for two rapid conversation opens and verify final active chat, message timeline, header, avatar and subscription ownership.
2. Audit typing/presence subscription ownership across legacy 25 and `rim-core-release.js`.
3. Move group-avatar signing and header DOM orchestration behind an application-facing presentation adapter without changing markup/classes.
4. Trace and retire only wrappers proven redundant by runtime characterization.
