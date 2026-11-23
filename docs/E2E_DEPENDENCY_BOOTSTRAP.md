# E2E SDK dependency bootstrap

## Why this exists

The local development container cannot resolve public package hosts (`EAI_AGAIN` for `registry.npmjs.org`) and cannot connect even when DNS is bypassed with a fixed IP. The working route is GitHub Actions: a network-enabled runner installs the package, verifies the tarball SHA-512, and uploads the full offline dependency bundle. The successful artifact has already been downloaded into this Iteration 140 workspace; this document preserves the repeatable procedure.

## One-time use

1. Include `.github/workflows/rim-e2e-sdk-download.yml` in the RIM repository. It runs on a push to `main` that changes this workflow, or can be started manually.
2. Open the repository's **Actions** tab and select **RIM E2E SDK network bootstrap**.
3. Wait for the `fetch-sdk` job to finish.
4. Download artifact `rim-e2e-sdk-offline-bootstrap` from the successful run.
5. Extract the artifact. Copy `rim-sdk/node_modules/` to the RIM project root as `node_modules/` (preserve the directory structure). The RIM source already contains its own complete `package-lock.json` and the verified SDK tarball under `vendor/`.
6. Run `npm ls --depth=0`, then `npm run build:cloudflare`. Do not run `npm install --offline` against an empty npm cache; the artifact's `node_modules` is the offline installation.

The workflow verifies the npm tarball against the SHA-512 integrity published by npm before uploading. The offline dependency artifact contains:
- the exact `open-e2ee-signal-protocol-sdk-14.7.0.tgz` npm package;
- `package.json` and `package-lock.json` from the bootstrap workspace;
- the installed `node_modules/` dependency graph, including `idb` and `esbuild`.

The downloader workflow uses read-only repository permission and does not deploy, access Supabase secrets, or modify production data. A separate `.github/workflows/rim-e2e-sdk-bootstrap.yml` runs the full RIM checks/build after Iteration 140 source is pushed and uploads the built Pages output. Artifacts expire after seven days.

## What remains after installation

- Test OPFS SQLite on a real Android Chrome/WebView and verify the IndexedDB fallback.
- Validate the emitted `assets/js/e2e/sqlite-worker.js` and `assets/js/e2e/sqlite3.wasm` in a real browser; static build and Node syntax checks have passed.
- Implement and test the Supabase `SignalProtocolRelayServer` adapter and RIM message envelope mapping. The package installation alone does not enable E2E.

## Successful installation record

- GitHub Actions run: https://github.com/dikijkot965-cpu/Rim/actions/runs/44910512359
- Artifact: `rim-e2e-sdk-offline-bootstrap` (21,339,883 bytes; SHA-256 `7303216bce11bfaa7b957984022c07a7ad5ac94affa1fd4c940aa1658ef29ead`).
- SDK tarball SHA-512: `kKJ0rn1Gxy1nXk3oYq4jVigmDUKcWlbpV7RmmSm8RrW7tRp0QJv01GHqIzHZdPm7WxqinoUgzMiBXB7qU/dB5w==`.
- Local verification: SDK `14.7.0`, `idb` `8.0.3`, `esbuild` `0.27.0`; `npm ls --depth=0` passes; real SDK client creation smoke test passes.
- First build revealed the SDK SQLite worker and Wasm are URL-loaded rather than imported as ordinary bundle dependencies. Iteration 140 now builds/copies them explicitly and passes the same-origin URLs to the SDK.
