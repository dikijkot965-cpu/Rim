# RIM 4.0.0 — iteration 2 report

Date: 2026-11-13

## Scope

Continue the incremental migration without changing the frozen visual interface or applying unreviewed production database changes.

## Implemented

1. `ConversationRepository.getDirectPeers` now normalizes and deduplicates IDs and processes membership, profile, and visible-presence lookups in bounded batches (default 100 IDs; configurable, clamped to 1–500).
2. The repository executes batches sequentially to avoid turning a large chat list into a burst of parallel PostgREST requests.
3. Presence remains a separate projection: `last_seen_at` is requested only for profiles with `show_online === true`.
4. Repository failures are returned as `Err` immediately; later query stages are not run after an earlier failure.
5. `ConversationListController.refresh` now builds a `Map` keyed by conversation ID once, rather than repeatedly scanning the complete conversation array for every rendered row.
6. Added `tests/conversation-repository.test.js` covering a 205-conversation case, bounded batch sizes, visibility-gated presence reads, empty input, and failure propagation.

## Verification

`npm run verify` passed:
- project integrity check: passed (33 JS files discovered by project checker; local HTML assets resolved);
- syntax check: passed (59 JavaScript files across source, legacy assets, scripts, and tests);
- Node test suite: 35 passed, 0 failed.

The new repository test confirms that 205 conversations are processed as membership batches of 100/100/5, profile batches of 100/100/5, and visible-presence batches of 100/3. No `.in(...)` batch exceeds 100 in that test.

## Not done / not claimed

- No production Supabase SQL, RLS policy, function privilege, Auth, Storage, or data changes were applied.
- No real two-account browser test or Android device test was run.
- No production load test was run; this change reduces query-filter size but does not certify 10,000 concurrent users.
- No visual redesign or HTML/CSS change was made.
- Legacy feature families remain in the codebase and are not considered migrated merely because the repository layer is improved.

## Next engineering target

Characterize and migrate the message-composition path (`sendMessage`, replies, edits, deletes, attachments, optimistic UI/error recovery) into an application use case and repository contract. Before replacing any legacy handler, inventory its current DOM hooks, payload shape, RLS assumptions, and realtime effects; retain compatibility until parity tests pass. Review the `chat_messages` table policies and constraints read-only before proposing SQL changes.
