# RIM 4.1.8 — Iteration 182

## Reliability and account defaults
- Favorites virtual row is injected after either the modular or compatibility conversation renderer.
- Zladen Auth provisioning now uses a single 43-character cryptographically random token, below Supabase Auth's 72-character password limit. Edge Function v4 is deployed.
- The missing `window.newGroupChat` entrypoint now opens the real group form and delegates to GroupCommandService.
- Feed preferences are isolated per account and persisted in the existing `rim_user_feed_preferences` table with owner-scoped RLS.

## Profile and UI lifecycle
- Profile editing is accessible directly from Settings and from the profile card.
- Avatar uploads validate MIME and size, provide an immediate preview, and center-crop to a 512px WebP image when browser APIs are available.
- Music section claims the modular player synchronously, avoiding a flash of retired markup.
- Member number is labeled as a registration serial, not an active account count.

## Security and compatibility
- No SQL schema changes in this iteration.
- Signal SDK 14.7.0, relay, key material, ciphertext storage and E2E behavior are unchanged.
- Group creation and profile writes continue to use existing server-side authorization and RLS boundaries.

## Verification
- 127 mapped source modules; 24 legacy scripts.
- 735 automated tests in GitHub Actions.
- Signal SDK entrypoint and browser stores verified.
- Cloudflare build, architecture checks, syntax checks, HTML audit, regression suite and Signal relay tests passed.
- Manual multi-account Android acceptance remains necessary for visual and session-specific behavior.
