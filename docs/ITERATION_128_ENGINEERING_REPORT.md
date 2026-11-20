# RIM 4.1.1 — Iteration 128 Engineering Report

## Scope

This iteration continues the 4.1.0 codebase. It does not replace the messenger or remove legacy compatibility surfaces.

## Recovery phrase

- Added user-facing education in first-run onboarding and Privacy → Account security.
- Phrase generation is now staged locally. Three random positions are selected; the user must correctly enter those words before the digest is sent to the Edge Function.
- Cancellation discards the pending phrase from the UI closure; the phrase is not stored in localStorage.
- Added `rim_account_has_password(uuid)`, a service-role-only SECURITY DEFINER RPC, so onboarding can distinguish a real password hash from an email-only identity.
- Edge Function `rim-account-security` is active at version 7.
- Added an actual 8 KB body-size limit (not only Content-Length), 512-character phrase limit and fail-closed handling when trusted `CF-Connecting-IP` is missing. Caller-controlled `X-Forwarded-For` and `X-Real-IP` are no longer trusted.
- Existing recovery code HMAC v1 derivation is preserved.

## Strict seed-only authentication

Not enabled in this release. Supabase Auth issues sessions independently of the UI; a frontend-only switch is bypassable. The documented implementation requires a Custom Access Token Hook, a one-time seed-auth grant tied to the created session, revocation of existing sessions, and authorization checks across PostgREST/RPC, Storage, Realtime and Edge Functions. The current magic-link recovery exchange is not yet a safe proof of seed-only authentication. See `docs/SEED_ONLY_AUTH_DESIGN.md`.

## Radio

Added 9 Russian-language stations and retained 6 SomaFM stations. Added text search, categories, HLS fallback via hls.js for the Europa Plus stream, and source labels. Actual playback on Android and geo-availability remain unverified on a physical device.

## Channel directory

Added dynamic category chips while preserving search, scope selection, membership state, signed avatar URLs, action delegation and stale-request protection. Full channel feed parity with Telegram remains separate work.

## Supabase security review

- 88/88 public tables have RLS enabled.
- Anonymous-executable SECURITY DEFINER functions: reduced from 25 to 0.
- Privileged mutation RPCs are no longer callable by anon/PUBLIC; trigger-only functions no longer have direct execute grants.
- RLS helper functions remain executable by authenticated because policies call them. Static review found `auth.uid()` checks in all 50 authenticated-executable SECURITY DEFINER functions; the generic Supabase advisor warning remains and is not proof of a vulnerability by itself.
- Ten RLS-enabled tables have no client policies. They are intentionally service-only/private tables: security state, recovery records/rate limits, RIM ID token/key tables, and trigger/internal tables.
- Remaining advisor warning: leaked-password protection is disabled in Supabase Auth settings. Enable it in the project dashboard.

## Validation

- `npm run check`: PASS — 107 mapped source modules.
- `npm run check:syntax`: PASS — 281 JavaScript files.
- `npm test`: PASS — 407/407.
- Cloudflare build: PASS — 146 Worker assets and 147 Pages-only files.
- Playwright E2E not run: `@playwright/test` is not installed and package installation timed out.
- Two-account tests not run: no disposable test users were provisioned.
- Android device tests not run: no physical Android device session is available.
- Production load test not run: requires isolated staging and an agreed traffic profile.

## Remaining release gates

1. Set a dedicated stable `RIM_RECOVERY_PEPPER` secret; do not rotate it after issuing credentials without a migration plan.
2. Implement and test strict seed-only authentication end-to-end before exposing its toggle.
3. Install Playwright in a network-enabled build environment and run browser E2E against a test Supabase project.
4. Provision two disposable accounts and test password/provider/phrase recovery and one-time redemption.
5. Verify Russian radio playback, channel browsing and music uploads on actual Android devices.
6. Run load tests on isolated staging, not on production.
