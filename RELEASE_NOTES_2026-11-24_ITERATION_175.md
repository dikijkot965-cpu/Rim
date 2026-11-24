# RIM 4.1.8 — Iteration 175

## Scope
Authentication recovery, Supabase-backed feed corrections, and automatic Zladen installation. This iteration intentionally leaves E2E implementation untouched.

## Authentication
- Added Telegram OIDC authorization-code flow with PKCE, state and nonce validation.
- Exchanges Telegram code through the existing `telegram-auth` Edge Function and verifies the returned Supabase magic-link token hash.
- Captures Telegram callback parameters before Supabase initializes its own URL detector.
- Added a bounded fallback to the classic bootstrap when the modular bundle fails to signal readiness, preventing a valid email session from remaining behind the login screen indefinitely.
- Added visible errors and button-state recovery for email sign-in.

## Feed
- Removed references to non-existent `feed_posts.content`, `feed_posts.text`, `feed_post_comments.user_id`, and comment content aliases.
- Uses deployed `body` and `author_id` fields.
- Added Following filtering through `user_follows`.
- Reads and toggles `feed_post_likes` reactions.
- Orders pinned content first; Recommended ranks by pin, likes, then recency.
- Refreshes remote cache even when the server returns an empty result, preventing stale local remote posts from leaking into other feed modes.

## Zladen
- Calls the existing authenticated `rim-zladen` Edge Function after login to provision and install the system bot.
- Existing production triggers already implement direct/group commands, moderation, economy, triggers and clan commands. The registry currently has no bot user, so first successful install will provision it using the unique superadmin role.

## Database
- No new SQL migration: production already contains the feed schema, RLS policies, Zladen tables, triggers, and install RPC. No duplicate schema was added.

## E2E boundary
No changes to Signal Protocol, relay, device keys, E2E migrations, or E2E behavior.

## Validation
A GitHub Actions workflow runs project checks, syntax checks, unit tests and Cloudflare build, then uploads a complete ZIP and SHA-256 artifact. Do not treat this iteration as verified until that workflow succeeds.

## Known follow-up
Feed media upload and private storage URL handling remain separate work; this iteration focuses on text posts, comments, likes and following feed correctness. Telegram callback must use the exact configured `TELEGRAM_REDIRECT_URI`.
