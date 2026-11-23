# Channel subsystem — iteration 132

## Design intent

The channel area is now structured as two distinct contexts: a subscriber-facing channel profile and a manager-facing control surface. The visual hierarchy follows the user's Telegram screenshots: persistent compact header, large channel identity block, clear subscriber count, segmented content tabs, publication cards, and a separate administrator dashboard. This is an original RIM implementation inspired by the reference interaction patterns, not copied Telegram assets or proprietary source code.

## Implemented

- Responsive channel hero with avatar, visibility type, username, description and subscriber count.
- Subscriber controls: subscribe/unsubscribe and discussion navigation.
- Manager controls: create post, create poll, invite, open settings.
- Manager-only dashboard: subscriber/admin counts, pending join request count, scheduled queue count.
- Tabs: Posts, Media, Links, About; managers additionally see Subscribers, Administrators, Requests and Scheduled.
- Media gallery derived from channel post `image_path` values; signed URLs use the existing `chat-files` bucket.
- Links gallery derived from HTTP(S) links found in post text.
- Bounded manager roster query with joined profile data; removal shortcut uses the existing moderation command.
- 30-day metrics from existing `channel_daily_stats` rows.
- Existing cursor pagination, pinned posts, reactions, polls and lazy comment loading preserved.

## Data and performance

- No database schema changes in this iteration.
- Initial post page remains bounded by repository `postLimit`; older posts use `(created_at,id)` cursor pagination.
- Media and roster are fetched on demand rather than on every channel open.
- Channel member and manager counts use server-side exact-count HEAD queries.
- Media URL signing is batched.

## Not yet implemented

- Automated scheduled-post publisher. The profile currently displays the number of queued rows only.
- Approve/reject join-request workflow. The profile currently displays the pending count only.
- Granular per-admin rights editor and full recent-actions log.
- Stories, live streams, channel DMs, gifts/collections, music shelf and channel appearance themes.
- Per-post view tracking and Telegram-style advanced analytics.
- Physical Android visual QA and browser E2E.

These items must not be represented as live features until their database authorization, service workflow and end-to-end tests are implemented.
