# RIM 4.0.0 — iteration 4 report

Date: 2026-11-13

## Scope

Unify the real legacy chat-opening path with the modular message timeline, reduce redundant peer-resolution work, and harden the message timeline against concurrent Realtime updates. Existing HTML, CSS, visual components, and the imperial interface were preserved.

## Important legacy integration defect found and corrected

The late legacy navigation module `assets/js/legacy/24-rim-architecture-rebuild-2026-11-05.js` opens a chat by calling `window.rimLoadMessagesStable()`, not `window.loadMessages()`. The modular runtime previously replaced only `window.loadMessages`, so the normal chat-opening path continued to use the older `SELECT *` loader and did not use the new cursor-paginated history loader as intended.

The composition root now binds both `window.rimLoadMessagesStable` and `window.loadMessages` to the same modular timeline data path. The legacy read-state call remains in its original position. The message renderer and visible controls are unchanged.

## Message timeline hardening

- Realtime INSERT/UPDATE/DELETE events received while the latest-history or catch-up query is in flight are journaled and replayed against the query result before it is committed to the UI state.
- Realtime subscription lifetime now uses a separate subscription epoch. A later history reload no longer invalidates the active channel callback.
- Callbacks from obsolete conversation subscriptions are ignored.
- Catch-up merges rows by ID and preserves deterministic chronological ordering.
- The existing page size remains 50 and older history remains cursor-paginated.

## Conversation list and direct-chat header

- Removed the obsolete peer-resolution wrapper in `assets/js/legacy/03-legacy-03.js`. It previously performed separate membership/profile lookups before the modular list controller repeated the same responsibility.
- The modular conversation-list resolver now omits last-seen presence reads during list loading; presence is not needed to paint the list.
- When a direct-chat peer profile is already cached, opening the chat refreshes only the peer's presence row instead of resolving membership and profile again.
- The conversation-list projection now displays the latest-message preview already maintained by the Realtime chat-list projection, instead of overwriting it with a generic peer label. Fallback labels remain unchanged when no message preview is known.

## Channel loading investigation

Channel loading was not rewritten in this pass. The current `renderChannelFull` path is demonstrably query-heavy: it loads the channel, then membership + up to 100 posts + up to 50 polls, then comments for the loaded posts + reactions + poll votes + an ad lookup chain, then author profiles and a signed avatar URL. Some groups are parallel, but the flow still has multiple dependent phases, and the ad lookup itself can require several sequential requests. This is a concrete candidate for the next performance pass.

Do not claim channel loading is optimized yet. The next pass should render the channel's core header/feed as soon as core data is available, lazy-load comments and other secondary panels, add request-generation guards against switching channels during loading, and measure query counts/latency with a real browser and Supabase test account.

## Browser verification status

- Added `tests/runtime-integration-smoke.html` as a browser fixture with Supabase stubs and the legacy inline chat-opening path.
- Added `tests/legacy-integration-contract.test.js`, which verifies the production HTML's inline composer entry point, the legacy generated chat-row handler, the legacy stable-loader call, and the modular replacement wiring.
- A real Chromium run was attempted, but the available Chromium executable hangs even on `about:blank` in this container. Therefore no actual browser execution is claimed. The static integration contract test is not a substitute for browser E2E.

## Verification

`npm run verify` passed:
- project check: 37 JavaScript files discovered; local HTML assets resolved;
- syntax check: 63 JavaScript files passed;
- Node tests: 56 passed, 0 failed.

No production Supabase changes were made. No Android test, two-account E2E, production browser run, or load test was performed.

## Not done / not claimed

- Channel feed performance is not yet fixed.
- Unread counter/read receipt behavior has not been comprehensively migrated or load-tested. The legacy read-state writes remain in place.
- Durable idempotency after client/network timeouts is not implemented.
- No certification for 10,000 concurrent active users.
- No production SQL, RLS, Storage, Auth, or data changes were applied.

## Next work

1. Channel feed staged rendering, lazy comments/reactions/poll detail loading, stale-request protection, and query/latency instrumentation.
2. Chat-list last-message projection, unread counts, read-state writes, and read receipts as one consistent application-level flow.
3. Browser execution on a functioning Chromium/Android device with a Supabase test project and two accounts.
4. Durable send idempotency design and migration review.
5. Continue forwarding, attachment metadata, reactions, and moderation features through application services.
