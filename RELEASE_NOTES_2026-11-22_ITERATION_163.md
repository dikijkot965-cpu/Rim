# RIM 4.1.8 — Iteration 163

Date: 2026-11-22
Baseline: `RIM_4.1.8_ITERATION_160.zip`

## Critical chat startup fix

- Fixed the race between Supabase session restoration and the asynchronously loaded modular application graph.
- `initializeApp()` now waits for the module-ready barrier before calling the modular chat-list loader or opening-chat entrypoints.
- The barrier is resolved only after the application surfaces and compatibility wrappers are installed.
- If the app module graph fails to load, the user sees a visible timeout error and reload action rather than an endless loading placeholder.
- Added regression checks for the startup barrier and the deployable root entrypoint.

## Browser deployment / E2E packaging fix

- The repository-root `index.html` now loads the bundled browser app, not raw source modules with unresolved bare SDK imports.
- `assets/js/rim-app.bundle.js` includes the pinned `@open-e2ee/signal-protocol-sdk@14.7.0` code.
- Added the SDK's same-origin `assets/js/e2e/sqlite-worker.js` and `sqlite3.wasm` to the repository root.
- Updated `build-cloudflare.mjs` so future builds also refresh the root GitHub Pages deployment assets, `dist/`, and `cloudflare-pages/`.

## Conversation search

- Added a search button in the open-chat header.
- Search is scoped to the active conversation, returns bounded results, and jumps to a surrounding timeline window.
- Server-side body search is allowed only when the conversation's `e2e_mode` is explicitly `off`. `pending`, `required`, missing, or unknown modes fail closed.
- Encrypted E2E local-index search remains a separate future feature; the server never receives E2E plaintext for search.

## E2E status

- No cryptographic protocol activation or production message-path switch was made. `protocolReady=false` remains mandatory.
- Secure multi-device linking is not yet implemented. The relay has device slots 1–5 and server-side revocation guards, while the browser runtime remains primary-device-only.
- Added a detailed design/implementation boundary for QR linking, per-device identity, encrypted history transfer, fan-out, and revocation.

## Zladen

- Zladen already has SQL and client-side foundations from Iterations 135–141, including group moderation, command permissions/aliases, internal ledger, reputation, awards, notes, reports, polls, reminders, clans, triggers, and anti-spam.
- No duplicate tables or second bot identity were created. Full Iris feature parity is not claimed.

## Verification

- `npm run check`: PASS
- `npm run check:syntax`: PASS
- `npm test`: PASS, 628/628
- `npm run verify`: PASS
- `npm run build:cloudflare`: PASS, 166 Worker assets / 167 Pages assets
- `npm run audit:html`: completed
- Real Android browser test: NOT YET RUN
- Real authenticated two-account E2E exchange: NOT YET RUN
