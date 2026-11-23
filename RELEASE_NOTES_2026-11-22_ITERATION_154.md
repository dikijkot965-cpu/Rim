# RIM 4.1.8 — Iteration 154

## E2E channel plaintext-path hardening

- Added a shared fail-closed policy gate for legacy channel operations that still write plaintext.
- Wired the gate into legacy channel poll creation, poll voting, and comment creation, including the older comment entrypoint.
- The gate checks private-channel E2E scope, rejects missing/error scope checks, and cancels when the active account or channel changes during the asynchronous check.
- Public channels retain their existing behavior; private channels with E2E off retain their existing behavior.
- Added SQL migration `20261122100000_rim_iteration_154_e2e_channel_plaintext_guard.sql` to reject direct database writes to channel posts, polls, comments, poll votes, and reactions in E2E-required private channels.
- Replaced the channel E2E activation guard so a channel cannot become E2E-required while legacy plaintext posts, polls, comments, or scheduled posts remain.
- Added nine tests for policy behavior, stale context, legacy mutation wiring, SQL guard structure, and the modular reaction path.
- Correctly shaped encrypted `channel_posts` envelopes remain permitted; only plaintext or malformed channel posts are blocked.

## Validation

- Full Node test suite: PASS (606/606).
- Project check: PASS (121 mapped source modules; 24 legacy scripts).
- Syntax check: PASS (328 JavaScript files).
- SDK/RIM relay adapter PQ+Braid round-trip: PASS (1/1; mock backend only).
- HTML audit: 93 sites (14 REVIEW, 24 OK, 55 STATIC).
- Cloudflare build: PASS (164 Worker assets; 165 Pages files).
- SQL has static tests only; no PostgreSQL execution or production migration was performed.

## E2E readiness

- `protocolReady=false` remains unchanged.
- No production Supabase changes, Edge Function deployments, GitHub pushes, or Cloudflare deployments were performed.
- The migration must be validated on an isolated PostgreSQL/Supabase environment before staging deployment.
