# E2E Iteration 153 — channel scheduled-post guard

Channel scheduled posts currently store `body` in plaintext in `channel_scheduled_posts`; the scheduler later copies it into `channel_posts` through `rim_channel_publish_scheduled`. The encrypted channel-post transport is not implemented, so allowing scheduled posts in an E2E-required channel would create a plaintext persistence path even if the final post trigger later rejected publication.

Iteration 153 therefore treats scheduling as unsupported for E2E-required private channels:

1. `ChannelFeedController.scheduleFromForm()` checks channel scope before calling the repository.
2. `ChannelFeedController.publishScheduledPost()` checks scope before calling the scheduler RPC.
3. Lookup errors and unknown channel privacy fail closed.
4. Account/feed identity is rechecked after scope lookup and schedule insertion; stale inserted rows are canceled on a best-effort basis.
5. Migration `20261122090000_rim_iteration_153_e2e_channel_schedule_guard.sql` blocks plaintext scheduled-post inserts/updates for E2E-required private channels.
6. The migration prevents a channel from transitioning to `e2e_mode='required'` while plaintext scheduled rows remain queued.

This is a guard, not encrypted scheduling support. The SQL has not been executed on PostgreSQL in this environment. It must be tested on isolated staging before deployment. No production migration or deployment was performed.
