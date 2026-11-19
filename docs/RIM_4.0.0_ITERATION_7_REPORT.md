# RIM 4.0.0 — iteration 7 report

Date: 2026-11-14
Version: `4.0.0-iteration.7`

## Scope

Move outgoing read-receipt state, tick rendering and active-chat read-state Realtime out of legacy scripts `25` and `06` into a dedicated application controller. Preserve the existing imperial interface and the existing single/double gold checkmark appearance.

## Implemented

- Added `src/application/read-receipt-controller.js`.
- The controller queries peer read cursors only for the active conversation and explicitly excludes the current user.
- The newest valid peer cursor is used to promote only the current user's messages at or before that timestamp to the double-check state.
- Sent ticks remain visible when read receipts are disabled; peer read-state lookups and subscriptions are skipped.
- Realtime subscriptions are scoped to the active conversation, replaced on conversation switch and removed during application disposal/sign-out lifecycle cleanup.
- Stale callbacks from a previous conversation are invalidated by a binding sequence.
- Existing `.rim-send-check` class and gold styling are preserved. Styling is now installed by the modular controller rather than injected by legacy script `25`.
- `src/app.js` composes the controller and routes the existing `openConversation` and `renderMessages` entry points through the modular owner, keeping one registered wrapper per entry point.
- Removed the old active-chat read-state Realtime subscription and tick-rendering wrapper from `assets/js/legacy/25-rim-stability-consolidated-20261105.js`.
- Removed the duplicate read-receipt query and DOM mutation from the attachment renderer in `assets/js/legacy/06-legacy-06.js`. The legacy attachment renderer remains because it still owns file/video/audio presentation.
- Added focused tests for current-user vs peer authorship, peer cursor selection, hidden read-receipt preference, query scoping, conversation-switch races, Realtime lifecycle and legacy retirement.

## Legacy retirement

This pass retires one complete read-receipt responsibility slice from two legacy files. It does **not** delete either file because both still contain unrelated required behavior.

- 24 legacy JavaScript files remain on disk and referenced by `index.html`.
- No additional legacy script file was deleted in this pass.
- The UI markup, CSS files and `index.html` were not changed.

## Verification

`npm run verify`: PASS.

- Project check: 41 JavaScript files discovered; local HTML assets resolved.
- Syntax check: 66 JavaScript files passed.
- Node tests: 76 passed, 0 failed.

No real browser/Android execution, two-account live Supabase E2E, production latency benchmark or load test was run. No production SQL, RLS, Storage, Auth or data changes were applied. No 10k concurrency claim is made.

## Remaining limitations

- Live read-receipt behavior still needs a two-account staging test to confirm actual RLS visibility and Realtime delivery.
- No browser-level characterization test currently verifies the visual checkmarks in Chromium or Android WebView.
- `showRead` is read from the existing local privacy preference cache. The legacy settings flow remains responsible for synchronizing that preference with the backend.
- Conversation unread counts still issue one exact-count request per conversation with bounded concurrency; no aggregate RPC was introduced.
- Initial conversation preview bootstrap remains a separate outstanding task.

## Next pass

Audit the channel/group legacy family (`17`, `19`, `20`, and relevant portions of `24`) and identify one bounded feature slice that can be moved without changing the interface. Prefer channel membership/role projection or group metadata reads only after inspecting actual call paths and tests. Do not modify production Supabase schema or policies without a reviewed migration plan.
