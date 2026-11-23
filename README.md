# Императорский Мессенджер (RIM)

> **Текущая локальная версия: 4.1.8-iteration.174.** На базе Iteration 172 сохранены секретные direct-чаты, Signal send/receive, scope-specific peer verification и fail-closed защита. Iteration 174 исправляет повторное использование SDK timestamp в групповой рассылке, добавляет трёхсторонние Signal SDK round-trip тесты для приватных групп и закрытых каналов и расширяет E2E Live Lab на все три типа защищённых областей. Production-обмен двумя реальными аккаунтами всё ещё требует отдельного испытания.

RIM — продолжающийся проект мессенджера на существующем интерфейсе, Supabase и модульной архитектуре. Это не новый проект и не откат к Iteration 144. Текущий пакет основан на восстановленном архиве Iteration 169 и сохраняет ручной GitHub upload workflow.

## E2E сейчас

- Secret direct chats: Signal Protocol encrypted text send/receive and device-local timeline.
- Private groups: per-member Signal fan-out, local history and fail-closed plaintext guards.
- Private channels: protected text publication, local E2E history and decrypted-message feed updates.
- Scope readiness requires encrypted challenge/ACK from every participant. A Relay connection alone is not sufficient.
- Ordinary chats remain on the existing plaintext path. Public channels and public groups are not E2E scopes.
- Automatic privacy-preserving telemetry is written to `rim_e2e_diagnostics` and displayed in the superadmin panel.
- QR pairing UI, encrypted state transfer, multi-device history sync and per-device ACK recovery are not complete. The code is not declared production-proven until a live Supabase two-account/two-device test passes.

## Злыдя сейчас

The existing Zladen implementation includes group permissions/moderation, profiles, ranks, reports, reputation/awards, notes/bookmarks, polls, non-cash economy, shop/inventory/market, games, triggers, clan and reminder SQL. The production Edge Function is already deployed. See [`docs/ZLADEN_FEATURE_MATRIX.md`](docs/ZLADEN_FEATURE_MATRIX.md) for the distinction between source-ready and production-applied features, plus the remaining Iris parity gaps.

## Verification

- `npm run check`
- `npm run check:syntax`
- `npm test`
- `npm run test:e2e:relay`
- `npm run build:cloudflare`

Latest results are recorded in [`RELEASE_NOTES_2026-11-22_ITERATION_172.md`](RELEASE_NOTES_2026-11-22_ITERATION_172.md). The relay two-account suite uses an in-memory relay and is not a live Supabase production test.

## Deployment and continuation

- Android/Acode workflow: [`docs/ANDROID_GITHUB_UPLOAD.md`](docs/ANDROID_GITHUB_UPLOAD.md).
- Current technical status: [`docs/CURRENT_STATUS.md`](docs/CURRENT_STATUS.md).
- Handoff for the next engineering session: [`NEXT_CHAT_HANDOFF.md`](NEXT_CHAT_HANDOFF.md).
- Manual GitHub upload remains the deployment path. No automated ZIP deployment workflow is included.

## Offline Signal SDK

The project vendors `vendor/open-e2ee-signal-protocol-sdk-14.7.0.tgz`. The package is restored offline and its SHA-512 is recorded in the Iteration 173 release notes. Do not commit `node_modules`; install from the lockfile or the vendored tarball as appropriate for the build environment.
