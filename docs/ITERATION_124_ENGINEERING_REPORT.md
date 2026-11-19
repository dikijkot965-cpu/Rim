# RIM 4.0.0 — Iteration 124 engineering report

## Objective

Resolve the Cloudflare deployment failure caused by treating a mixed repository (browser client + Supabase Edge Function TypeScript + migrations + tests/docs) as a directly deployable static Worker project.

## Root cause

The failing Workers Builds job ran `npx wrangler deploy` but had no configured static assets directory and no preceding build step. Wrangler therefore could not discover the static website output. The repository's `supabase/functions/telegram-auth/index.ts` is a Supabase Edge Function, not a Cloudflare Worker entrypoint.

## Changes

1. Added `scripts/build-cloudflare.mjs`.
   - Cleans and recreates `dist/`.
   - Copies only `index.html`, `manifest.json`, `icons/`, `assets/`, and `src/`.
   - Validates local HTML asset references.
   - Explicitly rejects server/build-only directories and potential secret-bearing filenames.
2. Added `wrangler.jsonc` with static assets rooted at `./dist` and Worker name `rim-messenger`.
3. Added npm commands:
   - `npm run build:cloudflare`
   - `npm run deploy:cloudflare` (build then pinned Wrangler 4.165.0 deploy)
   - `npm run preview:cloudflare`
4. Added regression tests for build isolation, config, and npm scripts.
5. Added GitHub Actions CI for verification and asset build.
6. Added `docs/CLOUDFLARE_DEPLOYMENT.md`, separating Workers Builds, Pages, and manual static upload instructions.
7. Updated handoff, status, README, and release metadata to Iteration 124.

## Verification

- `npm run build:cloudflare`: PASS; generated 143 browser-public files.
- `dist/` contains `index.html`, modular `src/`, CSS/JS/images, icons, and manifest.
- `dist/` does not contain Supabase functions, migrations, tests, docs, SQL, package metadata, or TypeScript files.
- `npm run verify`: architecture check PASS; syntax check PASS; 393 Node tests PASS; Playwright E2E skipped because `@playwright/test` is not installed.

## Important deployment distinction

For the log shown (Workers Builds): root directory `/`, build command `npm run build:cloudflare`, deploy command `npx wrangler deploy`. `wrangler.jsonc` points to `dist/`.

For Cloudflare Pages: build command `npm run build:cloudflare`, output directory `dist`; do not run `wrangler deploy` as the Pages build command.

The current Wrangler Worker name is `rim-messenger`. If the existing Cloudflare Worker service has another name, this config value must be changed to that exact name to avoid targeting a different service.

## Not claimed complete

- No real Cloudflare deployment was run from this environment; the configuration and build artifact were validated locally, but the Cloudflare account's build has not yet been re-run.
- The GitHub connector currently returns no repositories for the authenticated owner and a 404 for the remembered `dikijkot965-cpu/Rim` path. Therefore these local changes have not been pushed to the user's GitHub repository.
- Telegram OAuth still needs the deployed RIM URL configured as `TELEGRAM_REDIRECT_URI`, plus the server-side Telegram client secret in Supabase Edge Function Secrets.
- Independent RIM password, recovery codes, passkeys, and safe provider linking are still roadmap items, not implemented in this iteration.
- Playwright E2E, two-account live tests, SECURITY DEFINER review, and 10k-concurrency load testing remain outstanding.
