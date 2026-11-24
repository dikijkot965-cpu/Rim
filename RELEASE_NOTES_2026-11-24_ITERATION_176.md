# RIM 4.1.8 — Iteration 176

## Scope
Zladen group-management console, activation of durable reminders, and social-feed media/saved posts. No E2E implementation changes.

## Zladen
- Added a group admin command console, opened from group settings by owners/admins.
- Added command shortcuts for help, group statistics, moderation, ranks/commands, virtual economy, quiz, market, clans, reminders and reports.
- Added validated forms for message triggers, join greetings and trigger deletion.
- Commands are sent as ordinary chat messages so the existing server-side trigger and permission checks remain authoritative.
- The console refuses groups in E2E pending or required state.
- Existing production server handlers already cover moderation, rank/permissions, virtual points, shop/inventory/market, polls, reminders, clans and declarative triggers. No gambling or wager-based game mechanics are added; game surfaces remain non-wagering.

## Reminder scheduler / database
- Enabled pg_cron in the active Supabase project.
- Applied the existing Zladen reminder scheduler migration (171); the rim-zladen-reminders job is active every minute.
- Recorded the exact production migration version in supabase/migrations.
- Verified the rim-zladen Edge Function is ACTIVE.

## Feed
- Added a private feed-media Storage bucket with a 25 MB cap and an explicit MIME allowlist.
- Added Storage RLS for owner uploads/deletes and visibility-aware reads through app_can_view_feed_post.
- Added media metadata integration and signed URL rendering for images, video, audio, PDF and text files.
- Added saved-post toggles and a Saved feed tab.
- Preserved existing following/recommended feeds, likes and comments.

## E2E boundary
No changes to Signal Protocol, relay, device keys, encrypted payloads, E2E SQL, or E2E behavior. The new Zladen console explicitly blocks E2E pending/required groups.

## Validation
GitHub Actions runs project integrity, syntax checks, unit tests and Cloudflare build, then packages the full source and generated Pages/Worker output with SHA-256.

## Manual acceptance still required
- Real Android/WebView sign-in and group console smoke test.
- Two real accounts in a non-E2E group to verify bot command response and trigger execution.
- Two real accounts to verify feed media visibility under public/follower/private settings.
- Confirm storage upload and signed URL rendering on mobile.
