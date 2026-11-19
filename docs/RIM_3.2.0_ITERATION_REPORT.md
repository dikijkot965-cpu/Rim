# RIM engineering iteration 3.2.0-iteration-1

Date: 2026-11-13

## Delivered in source

1. `MessageRepository` now owns the chat-message read/write boundary for the timeline. The initial read selects only required columns, fetches the newest 50 rows, and reverses them for chronological display.
2. Older history uses a composite cursor `(created_at, id)` to avoid gaps or duplicate rows when multiple messages share a timestamp.
3. `MessageTimelineController` owns request generations, older-page state, deduplication, and scoped Realtime lifecycle.
4. Realtime INSERT/UPDATE/DELETE payloads update the in-memory list incrementally. A new message no longer causes the complete last-50 query to run again. After the channel is subscribed, a bounded catch-up read closes the initial-fetch/subscription race.
5. The history control is inserted as a sibling of the existing messages viewport and uses the current action-button style. The existing message renderer and all existing visual markup remain in place.
6. Realtime subscription cleanup is tied to sign-out and application disposal. A bounded catch-up query runs after subscription readiness to close the fetch/subscribe race.
7. Added unit coverage for deterministic ordering, cursors, newest-first pagination, and event merging.

## Verification

- `npm run verify`: PASS.
- Project integrity check: PASS.
- Syntax check: PASS across 58 JavaScript files.
- Node tests: 32/32 PASS.
- Frozen `index.html` / CSS baseline: the HTML receives one additive compatibility-bridge setter and CSS receives only the history-control style; no wholesale UI replacement was made.

## Not certified

- No browser E2E test was run in this environment. A manual runtime smoke fixture is included at `tests/runtime-smoke.html`; the headless Chromium process in this environment timed out before producing a reliable result, so it is not counted as passed.
- No Android-device interaction test was run.
- No two-account message/realtime test was run against the live project.
- No 100-user or 10,000-user load test was run.
- The 25 legacy scripts remain. This is a real vertical-slice migration, not a claim that all legacy code has been rewritten.
- No production database schema or RLS policy was changed in this iteration.

## Compatibility note

The live app's existing Supabase project and UI remain the integration target. The new module replaces only the chat timeline's data-loading and realtime-refresh behavior. The old composer, message rendering, reactions, attachments, channels, groups, profiles, admin functions, RIM ID and other existing feature paths remain on their current implementation pending separate characterization and migration.
