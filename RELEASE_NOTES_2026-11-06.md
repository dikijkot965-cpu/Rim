# RIM engineering pass — 2026-11-06

## Changes in this build

- Direct-message peer lookup now reads the authenticated-readable `profiles.show_online` projection. The peer's `user_settings` row is intentionally not queried from another account because its RLS policy is own-row-only.
- Saving privacy settings now synchronizes `user_settings.show_online` to the current user's `profiles.show_online`; loading privacy settings also reconciles that projection. Last-seen is updated only when the user has enabled online visibility.
- Opening a conversation closes the modular Favorites overlay first, preventing that overlay from remaining above the messenger.
- Channel role/invite settings now render their shell immediately and hydrate secondary lists asynchronously instead of blocking the settings modal.
- Fixed the local-music visibility selector so it matches the class applied directly to `#app`.
- Added repository tests for peer privacy projection behavior.

## Verification performed

- `npm test`: 6 tests passed.
- `npm run check`: passed; all local assets referenced by `index.html` resolve.
- `node --check`: syntax checks performed on modified JavaScript modules.
- Live Supabase schema and policy inspection was read-only. Confirmed `profiles.show_online`, `user_settings.show_online`, RLS enabled on relevant tables, and own-row-only `user_settings` read policy.
- No database schema, RLS policy, migration, or production data was changed.

## Still not certified / remaining work

- The project still contains 25 legacy classic scripts. This is not yet a full Clean Architecture rewrite and should not be represented as one.
- Typing indicator and unread-count/banner behavior require a separate pass against current Realtime authorization and read-state flows. No insecure public typing channel was added.
- Full browser E2E on mobile, real account-to-account privacy checks, voice-message functionality, and load tests were not run.
- This build is not certified for 100,000 concurrent users.

## 2026-11-15 — RIM 4.0.0 Iteration 16

- Moved uncached conversation membership validation and record retrieval into `ConversationRepository`.
- Added stale-navigation generation guards to the principal legacy conversation opener.
- Removed a duplicate read-cursor write after the stable message loader.
- Added repository and legacy integration coverage; `npm run verify`: 146 passed.
- No visual assets, CSS, HTML, production Supabase data or schema were changed.
