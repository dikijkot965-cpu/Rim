# RIM 4.0.0 — feature parity matrix

This is the migration ledger. Status is conservative: a function name or visible button is not proof of implementation.

Allowed statuses: `not inventoried`, `characterized`, `in progress`, `implemented`, `verified`, `blocked external`.

| Area | Existing source(s) | Target owner | Required proof | Status |
|---|---|---|---|---|
| Authentication: sign in/sign up/sign out/session refresh | legacy 02 | application/auth | auth E2E, expiry, cleanup, account switch | not inventoried |
| Profile load/edit/privacy/avatar | legacy 02, 03 | application/profiles | CRUD, privacy and storage tests | not inventoried |
| Settings persistence | legacy 02 | application/settings | reload and account isolation | not inventoried |
| Themes and languages | legacy 02, 08, 09 | features/settings | visual parity, persistence, fallback | not inventoried |
| Conversation list/search/filter/order | legacy 02, src/application/conversation-list-controller.js | features/chat-list | DOM parity, stale response, pagination | in progress |
| Direct conversation creation | legacy 02 | application/conversations | two-account E2E | not inventoried |
| Group creation and membership | legacy 02, 20 | application/groups | permission matrix, two-account E2E | not inventoried |
| Message history/loading | legacy 02, 15 | application/messages | cursor pagination, 10k-message test | not inventoried |
| Message rendering | legacy 02 | features/conversation | visual parity and XSS tests | not inventoried |
| Message sending/retry | legacy 02 | application/messages | idempotency, timeout and duplicate tests | not inventoried |
| Replies/edit/delete | legacy 02 | application/messages | ownership, concurrency and UI tests | not inventoried |
| Reactions/stickers/mentions | legacy 02 | application/messages | idempotency, escaping and E2E | not inventoried |
| Pins and jump-to-message | legacy 03 | application/messages | authorization and history-scroll tests | not inventoried |
| Read state/unread counts | legacy 03, 25 | application/read-state | two-user, multi-device tests | not inventoried |
| Typing indicator | legacy 16, src/app.js | infrastructure/realtime | expiry, privacy and cleanup tests | in progress |
| Realtime messages and list updates | legacy 02, 25 | infrastructure/realtime | reconnect, dedupe, disposal, load | not inventoried |
| Image/file attachments | legacy 02, 13 | application/media | upload, signed URL, cancellation, cleanup | not inventoried |
| Groups: avatars/info/roles | legacy 06, 20 | features/groups | role authorization and visual parity | not inventoried |
| Channels: list/create/profile | legacy 02, 03, 19 | application/channels | owner/member authorization | not inventoried |
| Channel posts/edit/delete/comments | legacy 02, 03, 19 | application/channels | CRUD and two-account E2E | not inventoried |
| Channel reactions/subscriptions/followers | legacy 02, 19 | application/channels | idempotency, visibility and count tests | not inventoried |
| Channel wallpaper and channel-group links | legacy 03, 19, 20 | application/channels + storage | policy and navigation tests | not inventoried |
| Favorites and saved items | legacy 16, 18, 24; src/features/favorites-workspace.js | features/favorites | persistence and stale-reference tests | in progress |
| Workspace and navigation | legacy 04, 05 | features/workspace | navigation and persistence E2E | not inventoried |
| Lite Writer documents and formatting | legacy 16, 24; src/features/lite-writer.js | features/writer | create/edit/reload/format tests | in progress |
| Lite Writer autosave/local fallback | legacy 16, 24; src/features/lite-writer.js | application/writer | race, offline, conflict, recovery tests | in progress |
| Local audio import and playback | legacy 16, 21; src/features/local-music.js | features/music | import, playback, cleanup tests | in progress |
| Playlists and music statistics | legacy 06; src/domain/music-statistics.js | features/music | CRUD and aggregation tests | partial |
| Notifications, badges, read state | legacy 03 | features/notifications | delivery, dedupe and read E2E | not inventoried |
| Push notification settings | legacy 03 | application/notifications | permission and preference tests | not inventoried |
| Bulletin board | legacy 03 | features/bulletin | create/moderate/delete E2E | not inventoried |
| Reports and report context | legacy 03, 11 | application/reports | privacy, target validation and authorization | not inventoried |
| Moderation queue/actions | legacy 03, 17 | application/moderation | role tests and audit trail | not inventoried |
| Personal wallpaper/profile extras | legacy 03 | application/profiles + storage | upload and preference tests | not inventoried |
| Admin user/channel/report management | legacy 17, 22, 23 | features/admin | server-side role enforcement and audit tests | not inventoried |
| RIM ID linking/requests | legacy 22, 23 | application/rim-id | expiry, replay, collision and unlink tests | not inventoried |
| Ads/destinations/analytics | legacy 16, 19, 23 | application/advertising | URL allowlist, admin role and aggregation | not inventoried |
| Seasonal/Halloween effects | legacy 01, 08, 09 | features/seasonal | screenshot, focus and pointer tests | not inventoried |
| PWA and relative deployment paths | manifest.json, index.html | infrastructure/pwa | root and subpath install/update tests | not inventoried |
| Supabase schema/RLS/Storage security | SQL + all Supabase calls | infrastructure/security | two-user live policy suite | blocked external |
| Live production schema verification | SQL + Supabase | infrastructure/supabase | schema diff against target project | blocked external |
| Android visual/keyboard behavior | index.html + all features | browser E2E | real-device/browser run | blocked external |
| 10,000 concurrent capacity | backend/runtime | performance validation | staging load test with SLO report | blocked external |

## Rules for status changes

- `characterized`: current behavior and edge cases are documented.
- `in progress`: implementation has started; parity is not proven.
- `implemented`: replacement code exists, but required tests may remain.
- `verified`: relevant tests pass, including integration/E2E where required.
- `blocked external`: local work is complete as far as possible, but evidence requires a live external system, device or credential.
- Never mark a feature `verified` because its module imports or its button renders.


## Iteration 3.2.0 update — message history

| Capability | Status | Notes |
|---|---|---|
| Load newest messages first | Migrated | Bounded newest-50 query, chronological display |
| Load older history | Migrated | Composite `(created_at, id)` cursor; explicit history control |
| Realtime message changes | Migrated | INSERT/UPDATE/DELETE update in-memory timeline incrementally |
| Message composition / edits / deletion | Legacy | Existing UI and Supabase paths retained; not yet migrated to the new repository |
| Two-account live verification | Not verified | Requires browser sessions against the live project |
