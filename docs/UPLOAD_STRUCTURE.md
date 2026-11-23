# RIM Iteration 163 — ZIP structure and what each part does

The archive is a complete source + static deployment package, not a ZIP containing only the web page.

## Root deployment files (GitHub Pages publishes these)

```text
index.html
assets/
  css/
  images/
  js/
    rim-runtime-bootstrap.js
    rim-app.bundle.js
    core/
    legacy/
    e2e/
      sqlite-worker.js
      sqlite3.wasm
icons/
manifest.json
service-worker.js
```

`index.html` loads the classic bootstrap first and the bundled browser app after it. The bundle contains the pinned Signal SDK. The SQLite worker and WASM are separate same-origin assets required by the SDK storage adapter.

## Editable application source

```text
src/
  app.js
  application/
  composition/
  core/
  domain/
  features/
  infrastructure/
  security/e2e/
```

`src/security/e2e/` contains the Signal runtime, local store, relay adapter, scope policy, and the opt-in in-app live lab. The lab is opened by adding `?rim-e2e-lab=1` to the normal RIM URL.

## Backend and database source

```text
supabase/
  migrations/
  functions/
    rim-e2e-relay/
    rim-zladen/
    rim-bot-api/
    rim-bot-manage/
    ...
```

The migrations are versioned history. Never delete them when replacing only the front-end release. `rim-e2e-relay` is deployed live; `rim-zladen` source is present but still needs its Zladen migrations 136–141 and a separate Edge Function deployment.

## SDK/build dependencies

```text
package.json
package-lock.json
vendor/
  open-e2ee-signal-protocol-sdk-14.7.0.tgz
scripts/
.github/workflows/
```

Pinned versions:

- `@open-e2ee/signal-protocol-sdk@14.7.0`
- `idb@8.0.3`
- `esbuild@0.27.0`

`node_modules/` is intentionally not included: GitHub Pages does not need it because the browser bundle is already built. The SDK tarball, lock file, and build workflows are included for reproducible future builds.

## Other preserved project folders

- `bot-runtime/` — bot platform/runtime source.
- `sql/` — supplemental SQL and diagnostics.
- `tests/` — automated tests.
- `docs/` — release notes, handoff, deployment instructions, E2E design.
- `dist/` — built Worker output.
- `cloudflare-pages/` — built static Pages output.
- `wrangler.jsonc`, `RIM_MODULE_MAP.json`, `BUILD_INFO.txt` — build/deployment metadata.

## Files intentionally absent

- `.git/` — GitHub manages repository history; it is not uploaded as a project file.
- `node_modules/` — unnecessary for static Pages deployment; very large and reproducible from the pinned lock file/workflow.
- `.env`, service-role keys, Supabase secrets, user passwords, JWTs, private keys — secrets must remain in the Supabase/hosting secret manager and local device storage.

## Android one-ZIP deployment

The archive includes `.github/workflows/deploy-rim-project-zip.yml`. Install that workflow once, upload the ZIP to `release-upload/`, then run the workflow with explicit confirmation. See `docs/ANDROID_ZIP_DEPLOY_WORKFLOW.md`. The workflow replaces tracked repository files but does not touch the live Supabase database or Edge Functions.
