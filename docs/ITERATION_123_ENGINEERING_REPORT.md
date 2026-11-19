# RIM 4.0.0 — Iteration 123 engineering report

Date: 2026-11-19
Base: `RIM_4.0.0_CONTINUATION_2026-11-19_ITERATION_122.zip`

## Delivered

### Telegram OIDC
- Telegram is now the primary sign-in action in the auth screen.
- Client ID `9041438103` is used as the public OIDC client identifier.
- Browser flow uses Authorization Code + PKCE S256, `state`, and `nonce`.
- Callback checks state and age, strips OAuth response parameters from the address bar, exchanges the code through a Supabase Edge Function, and redeems a one-time Supabase magic-link token hash.
- New `telegram-auth` Edge Function was deployed to the active `Императорский Мессенджер` Supabase project.
- Server validates Telegram ID token signature using Telegram JWKS and validates issuer, audience, expiry, issue time, nonce and numeric subject.
- Stable Telegram subject-to-Supabase-user mapping is stored in `public.rim_auth_identities`.
- No service-role key or Telegram client secret is included in browser code.

### Provider presentation
- Telegram is visually emphasized as the primary provider.
- Google, GitHub and VK are visible but disabled and marked `В разработке`.
- The Google OAuth method remains available in code for later provider configuration, but the UI does not falsely advertise it as active.

### Offline outbox
- Queue storage is partitioned by Supabase user ID.
- Legacy ownerless `rim.outbox.v1` data is not replayed under any account.
- Queue persistence failure now returns an error instead of claiming the message was saved.
- Stale `sending` entries are returned to `pending` after a restart.
- Retry backoff prevents immediate retry loops.
- Queue replay captures and rechecks the account ID and carries the conversation type for direct-chat policy checks.
- Server message insert uses `client_message_id` and a unique `(sender_id, client_message_id)` index to make replay idempotent after an uncertain network response.

### Supabase schema
Applied additive migration `20261119124951_rim_telegram_identity_and_message_idempotency`:
- creates `public.rim_auth_identities`;
- enables RLS;
- revokes table access from `anon` and `authenticated`;
- grants table access to `service_role` only;
- adds `chat_messages.client_message_id` and its unique index.

The migration was verified against the live database. RLS is enabled and `anon` / `authenticated` do not have SELECT privileges on the identity map.

## Verification

- `npm run check`: PASS — 104 mapped source modules.
- `npm run check:syntax`: PASS — 273 JavaScript files.
- `npm test`: PASS — 390 tests, 0 failures.
- `npm run audit:html`: 70 `innerHTML` sites: 40 static, 24 classified OK, 6 REVIEW. The review items are not represented as fixed by this iteration.
- `npm run test:e2e`: skipped because `@playwright/test` is not installed in this environment. This is not a browser E2E pass.
- Supabase migration: applied successfully.
- Supabase Edge Function `telegram-auth`: deployed, ACTIVE, version 1.

## Required owner configuration before Telegram login can be live-tested

The Edge Function expects two secrets that cannot be copied from Auth provider settings automatically:

1. `TELEGRAM_CLIENT_SECRET` — set this in Supabase Edge Function Secrets using the secret issued by BotFather. Do not paste it into chat, source files, SQL or browser code.
2. `TELEGRAM_REDIRECT_URI` — set this to the exact deployed RIM URL consisting of origin + pathname, for example `https://your-domain.example/index.html`.

Register the exact same redirect URI in Telegram Login settings in BotFather. The public client ID defaults to `9041438103`; `TELEGRAM_CLIENT_ID` can be set explicitly if desired.

The Telegram sign-in implementation is deployed but cannot complete a real OAuth login until those Edge Function secrets and the BotFather allowed redirect URI match.

## Not completed in this iteration

- RIM Recovery Codes issuance and one-time recovery login.
- Independent RIM password management and sign-in by RIM ID.
- Passkeys / WebAuthn credential registration and assertion.
- Safe linking/unlinking of Telegram, Google, GitHub and VK identities to existing accounts.
- Full Playwright browser suite and actual two-account live-message E2E tests.
- Full XSS review of the six REVIEW sites.
- Broad review/remediation of pre-existing SECURITY DEFINER advisor warnings. These were not mass-modified because doing so without per-function authorization analysis could break existing RPC flows.
- Load testing at 10,000 concurrent active users.

## Next engineering priorities

1. Configure the two Telegram Edge Function secrets and confirm the exact BotFather redirect URI.
2. Run a real Telegram sign-in and verify that repeat sign-in resolves to the same Supabase user and RIM profile.
3. Add identity linking for already-existing email/password accounts, requiring a recent authenticated session.
4. Implement Recovery Codes with hashed-only storage, single-use atomic consumption and generic failure responses.
5. Add RIM password setup/change and independent sign-in without making external providers mandatory.
6. Implement Passkeys with WebAuthn challenges, origin/RP-ID validation and credential revocation.
7. Install Playwright and run real browser E2E flows.
