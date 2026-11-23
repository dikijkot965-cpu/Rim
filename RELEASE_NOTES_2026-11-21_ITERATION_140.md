# RIM 4.1.8 — Iteration 140

## Zлыдя: command control and report triage

- Added per-group aliases: `/alias add псевдоним команда`, `/alias del псевдоним`, `/aliases`.
- Built-in command names are reserved and cannot be shadowed by custom aliases.
- Added `/setcommand команда on|off [ранг]` and `/commands`.
- Added a server-side BEFORE INSERT command gate. Permissions are checked before the legacy moderation dispatcher and the extended command dispatcher can run; aliases are canonicalized before the same check.
- Alias execution uses a private transaction marker rather than trusting client-controlled message metadata. Synthetic dispatch rows do not inflate member statistics or anti-flood counters.
- Added `/settings`, `/reports` and `/reportresolve UUID reviewing|resolved|rejected комментарий`.
- Added `/setwelcome on|off` and `/setrules clear`; control words now change settings instead of being saved as literal welcome/rules text.
- All new bot command handlers skip conversations with `e2e_mode='required'`.

## E2E SDK installation and browser asset build

- Direct local npm access failed because DNS returned `EAI_AGAIN`; direct-IP HTTPS connections also failed.
- Used a read-only GitHub Actions network runner to install the exact dependencies, verify the npm tarball SHA-512 and upload an offline dependency bundle. Downloaded the artifact, installed the SDK in the local workspace and generated a full integrity-bearing lockfile.
- Vendored the exact SDK tarball under `vendor/`.
- Added a real SDK client-creation smoke test using strict post-quantum/Braid policy and test-only in-memory storage.
- Fixed the SDK worker/Wasm packaging gap: esbuild now builds the module worker separately, copies SQLite Wasm, and runtime passes explicit same-origin URLs.

- Node.js 22.16.0 satisfies the SDK's `>=22.12.0` requirement.
- Local direct npm access remains blocked by DNS `EAI_AGAIN` and unavailable outbound HTTPS, but the GitHub Actions workaround completed successfully. The runner installed the pinned dependency graph, verified the SDK tarball SHA-512 and uploaded an offline artifact; that artifact was downloaded and installed into the local workspace.
- The offline dependency bundle's SHA-256 is `7303216bce11bfaa7b957984022c07a7ad5ac94affa1fd4c940aa1658ef29ead`.
- Added `package-lock.json` with full registry URLs and integrity hashes, and vendored the exact SDK tarball in `vendor/`.
- The SDK smoke test created a real client with strict PQ/Braid policy using test-only in-memory storage. This is not a production message exchange.
- No Supabase relay adapter, RIM encrypted inbox/outbox, two-account exchange, or E2E activation exists yet.
## Verification

- Project check: 117 mapped modules, PASS.
- Syntax check: 314 JavaScript files, PASS.
- Node tests: 516/516, PASS.
- HTML audit: 93 sites (14 REVIEW, 24 OK, 55 STATIC).
- Cloudflare build: 160 Worker assets / 161 Pages files, PASS; main bundle, SQLite worker and Wasm emitted.
- Playwright E2E skipped because `@playwright/test` is not installed. These checks do not replace PostgreSQL runtime tests.
- No Supabase migration or Edge Function deployment performed.
- No GitHub push or Cloudflare deployment performed.
- E2E remains disabled: the SDK is installed and bundled, but no Supabase relay adapter, RIM ciphertext inbox/outbox or two-account encrypted exchange exists.
