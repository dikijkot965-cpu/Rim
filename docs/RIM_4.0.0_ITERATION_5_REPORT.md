# RIM 4.0.0 — iteration 5 report

Date: 2026-11-13

## Scope

Improve channel opening latency without changing the existing visual design. Preserve the current imperial interface, styles, and interaction vocabulary. No production Supabase schema or policy changes.

## Changes

### Staged first paint

`assets/js/legacy/19-rim-update-channels.js` now renders the channel header, membership actions, composer (when authorized), and a basic first-page post shell as soon as the core channel + membership + feed + poll + optional avatar requests complete. Reactions, poll votes, author profiles, and advertising no longer block that first shell.

Initial post fetch is bounded to 30 (previously 100); poll fetch is bounded to 20 (previously 50). This reduces the amount of feed data and related secondary work on initial channel opening. The visible feed is then upgraded with author names, reactions, and poll counts.

### Lazy comments

The former eager query loaded comments for every post on the page. Comments are now fetched only when the user opens an individual post's comments panel, with a maximum of 100 comments for that post. Author profiles for those comments are fetched only at that point. A loaded panel is cached in its DOM for the current view; failed loads can be retried by closing and reopening.

### Deferred advertising

The ad settings/campaign/target/signed-media lookup runs after the feed is painted and inserts the ad block when ready. Its failure is logged without blocking or invalidating the feed. The existing five-minute per-user/channel view/impression deduplication is preserved.

### Navigation race protection

Every channel open receives a monotonically increasing request epoch. Responses from an older channel open are ignored after navigation to another channel or closing the view. The same guard is checked after dependent author-profile requests and before inserting deferred advertising.

## Query-path comparison (structural, not live latency measurement)

Previously, channel open eagerly fetched channel, membership, up to 100 posts, up to 50 polls, comments for all posts, reactions, poll votes, author profiles, channel avatar, and the advertising lookup chain before rendering the full page.

Now the first shell requires the channel lookup plus the parallel membership/posts/polls requests and optional avatar signing. The feed enrichment then fetches reactions, poll votes, and visible-page author profiles. Comments and ads are independent follow-up work. A comments query occurs only when a particular post's comments are opened.

This is a structural reduction in work on the critical path, not proof of a particular millisecond improvement. Live Supabase latency, device rendering, RLS execution plans, and real network conditions have not yet been measured.

## Verification

`npm run verify` passed:
- project check: 37 JavaScript files discovered; local HTML assets resolved;
- syntax check: 63 JavaScript files passed;
- Node tests: 57 passed, 0 failed;
- static integration contract test checks bounded fetch sizes, lazy comment query, deferred ad lookup, and stale-request guards.

No real Chromium E2E, Android test, two-account test, live Supabase timing profile, or load test was run. No production SQL, RLS, Storage, Auth, or data changes were applied.

## Not done / not claimed

- No measured before/after channel load-time benchmark.
- Channel post pagination beyond the first 30 is not implemented in this pass.
- Comments are capped at 100 per post and do not yet have their own pagination.
- Reactions and poll votes still load as secondary feed enrichment for the first page.
- Unread counters/read receipts are not yet consolidated into one application-level projection.
- No certification for 10,000 concurrent active users.

## Next work

1. Audit conversation list ordering, last-message projection, unread counters, read-state writes, and receipts as one consistent state flow.
2. Add channel post pagination and comment pagination, then consider per-post reaction aggregation to avoid returning every reaction row.
3. Execute browser smoke and two-account integration tests in a working browser environment.
4. Measure real Supabase query latency/counts and inspect relevant indexes/RLS plans before proposing production database changes.
5. Continue migrating message reactions, forwarding, attachment metadata, and read receipts behind application services.
