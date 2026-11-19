# Cloudflare deployment — RIM 4.0

RIM's browser client is static HTML/CSS/JavaScript backed by Supabase. `supabase/functions/**` are Deno/TypeScript Edge Functions and are **not** Cloudflare Worker entrypoints. The repository intentionally has two deployment targets so the dashboard uploader never sees backend source files.

## Critical: the ZIP/repository root

The release ZIP has the project files directly at its top level. Do not upload a wrapper directory containing the project as a nested child. Cloudflare must see `package.json` and `wrangler.jsonc` at the configured Worker root. The previous archive was nested under `rim_work/`; when Cloudflare built the repository root, it therefore could not see the Wrangler config or `dist/` build script. This explains the “No dependencies detected” line and the later “Could not detect a directory containing static files” error.

## Option A — Cloudflare Pages (recommended for a static site)

The generated `cloudflare-pages/` directory is a self-contained static-only publication root. It contains `index.html`, `manifest.json`, `icons/`, `assets/`, `src/`, and `_headers`. It contains no `wrangler.jsonc`, `package.json`, TypeScript, Supabase functions, migrations, tests, or build scripts.

For Git integration (recommended for ongoing updates), create/select a **Pages** project and set:

| Setting | Value |
|---|---|
| Root directory | `/` (repository root) |
| Build command | `npm run build:cloudflare` |
| Build output directory | `cloudflare-pages` |

This lets Pages rebuild the static publication folder from the latest source on every GitHub commit. Cloudflare Pages Git integration automatically deploys each push; choose this workflow at project creation because Cloudflare does not let a Git-integrated Pages project switch to Direct Upload later. If you intentionally want a no-build static project, set Root directory `/cloudflare-pages`, leave Build command empty, and set output directory `.`; in that mode remember that `cloudflare-pages/` must be regenerated and committed whenever source files change.

For manual static upload, upload the **contents of `cloudflare-pages/` only**. Do not upload the repository root or the full ZIP. The uploader should see an ordinary static site, not a Worker project.

Do not enter `npx wrangler deploy` in a Pages build or deploy field. Pages publishes the configured output directory itself.

## Option B — Cloudflare Workers Builds

Use this only if the Cloudflare dashboard project is a **Worker with Workers Builds**, not Pages. The project root must be the repository root, where `package.json` and `wrangler.jsonc` now live.

| Setting | Value |
|---|---|
| Root directory | `/` |
| Build command | `npm run build:cloudflare` |
| Deploy command | `npm run deploy:wrangler` |

The build creates `dist/`; `wrangler.jsonc` explicitly points `assets.directory` to `./dist`. The deploy script pins Wrangler 4.165.0. The Worker name is currently `rim-messenger`. If an existing Worker has a different name, change the `name` field before deployment to avoid creating/updating a different service.

## Local validation

```bash
npm run verify
npm run build:cloudflare
```

Then inspect `cloudflare-pages/` before a manual upload. The build validates that `index.html` exists and that server/build-only files have not leaked into either publication directory.

## Supabase stays separate

Telegram OIDC and RIM account-security Edge Functions remain deployed to Supabase. They must be deployed through Supabase Edge Functions, not Wrangler. The public RIM website only calls their HTTPS endpoints using the Supabase publishable key; service-role keys and provider secrets remain server-side.
