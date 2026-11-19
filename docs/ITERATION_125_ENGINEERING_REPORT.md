# RIM 4.0.0 — Iteration 125 engineering report

Date: 2026-11-19

## 1. Root cause and Cloudflare correction

Iteration 124's ZIP placed the project beneath a top-level `rim_work/` directory. Cloudflare Workers Builds was configured against repository root `/`, so it did not see `package.json`, `wrangler.jsonc`, `scripts/build-cloudflare.mjs`, or the expected project root. That is consistent with the build log reporting no dependencies and Wrangler being installed ad hoc, then failing to locate static assets.

Iteration 125 release archive is flattened: project files are directly at ZIP root. `package.json`, `wrangler.jsonc`, `index.html`, and `scripts/` are visible from `/`.

`npm run build:cloudflare` now creates two publication targets:
- `dist/` for Workers Builds; `wrangler.jsonc` points `assets.directory` at `./dist`.
- `cloudflare-pages/` for Pages/manual static upload; it contains only browser files plus `_headers`, no Wrangler config, package manifest, TypeScript, Supabase Edge Functions, migrations, tests, or scripts.

### Cloudflare settings

Workers Builds:
- Root: `/`
- Build: `npm run build:cloudflare`
- Deploy: `npm run deploy:wrangler`

Cloudflare Pages Git integration:
- Root: `/`
- Build: `npm run build:cloudflare`
- Output: `cloudflare-pages`

Manual static upload:
- Upload the contents of `cloudflare-pages/` only, not the repository root or ZIP as a whole.

## 2. Account sovereignty: recovery codes

Implemented:
- Ten cryptographically random 128-bit codes per account.
- Codes are shown once during issue/rotation; browser code does not persist them.
- Database stores only HKDF-domain-separated HMAC-SHA-256 digests, never raw codes.
- Recovery table has RLS enabled and no direct `anon` or `authenticated` table privileges.
- Atomic database consumption updates `used_at` only when it is null, so one code cannot create multiple sessions.
- A successful redemption creates a one-time Supabase magic-link token hash server-side; the browser exchanges it with `verifyOtp`.
- UI to issue/replace codes in Settings and redeem one on the login screen.

Live changes on active Supabase project `xxvcsaomkyknudoaixbs`:
- Migration `20261119135738_rim_recovery_codes` applied.
- Edge Function `rim-account-security` deployed, version 2, ACTIVE, `verify_jwt=false` because it manually validates the bearer JWT for issue and allows one-time-code redemption without an existing session.
- SQL privilege verification: `anon_select=false`, `authenticated_select=false`, `service_role_select=true`; RPC execute privilege is service-role only.
- HMAC key derives from `SUPABASE_SERVICE_ROLE_KEY` via HKDF unless optional stable `RIM_RECOVERY_PEPPER` is set.

Remaining security improvement: rate limiting for recovery redemption and issue rotation. Current codes have 128 bits of entropy and are one-use; rate limiting is still needed for abuse resistance and operational controls.

## 3. Verification

- `npm run verify`: PASS — 399 Node tests, 0 failures.
- Architecture map: PASS — 105 source modules.
- Syntax: PASS — 277 JavaScript files.
- Cloudflare build: PASS — 144 Worker assets in `dist/`; 145 Pages-only files in `cloudflare-pages/`.
- Pages folder audit: no `.ts`, `.tsx`, `wrangler.jsonc`, or `package.json` files.
- Playwright E2E: skipped because `@playwright/test` is not installed. Do not claim browser E2E passed.

## 4. Not completed

- Independent RIM ID/password login for accounts created through Telegram.
- WebAuthn/passkeys. A stable production RP domain is needed before reliable passkey enrollment; each new host changes the relying-party origin constraints.
- Safe provider linking/unlinking with reauthentication and collision recovery.
- Recovery endpoint rate limiting.
- Real browser and two-account Telegram sign-in tests.
- Load testing for 10,000 concurrent active users.
- Full review of pre-existing SECURITY DEFINER warnings. New recovery RPCs are restricted to `service_role`; unrelated existing RPCs were not mass-modified to avoid breaking application behavior.

## 5. Important distinction

This iteration corrects the release layout and provides a Cloudflare-ready static folder. It cannot publish to the user's Cloudflare account or change GitHub repository settings through the currently connected GitHub integration. The new ZIP is prepared for upload with the repository root correctly flattened.
