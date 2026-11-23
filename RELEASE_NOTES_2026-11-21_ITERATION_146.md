# RIM 4.1.8 — Iteration 146

## Основной фокус: безопасная граница между E2E-режимом и обычной отправкой

### Изменения
- `MessageCommandService.sendText()` теперь проверяет режим E2E личной переписки до вставки в `chat_messages`.
- Если scope имеет `e2e_mode = required`, отправка открытого текста блокируется; сервис не делает fallback в `chat_messages.body`. Это действует и при повторной отправке из outbox.
- Ошибка проверки E2E scope также блокирует отправку: неизвестное состояние не трактуется как `off`.
- Для `off` и `pending` сохраняется прежний путь отправки. `pending` не рекламируется как защищённый режим и остаётся обычной перепиской до доверенной активации.
- `E2EScopeRepository` не обращается к реестру устройств/RPC для `off` и `pending`, уменьшая лишние запросы и сохраняя совместимость до установки Relay-миграций.
- Отсутствующая колонка `e2e_mode` распознаётся как legacy-схема только для точных ошибок PostgreSQL `42703` или PostgREST `PGRST204`, если сообщение явно указывает на `e2e_mode`. Другие ошибки проверки не обходятся.
- Убраны глобальные `window.rimE2ESignalRuntime`, `window.rimE2EMessageStore` и `window.rimE2ESendDirect`: сырой криптографический API остаётся внутри composition container, чтобы не обходить scope policy преждевременным глобальным вызовом.

### Проверки
- `npm run check`: PASS.
- `npm run check:syntax`: PASS, 322 JavaScript-файла.
- `npm test` (serialized test workers for deterministic resource usage): PASS, 554/554.
- `npm run test:e2e:relay`: PASS, 1/1 SDK/relay-adapter round-trip через mock backend.
- `npm run audit:html`: 93 участка (14 REVIEW, 24 OK, 55 STATIC).
- `npm run build:cloudflare`: PASS, 162 Worker assets / 163 Pages files.

### Ограничения
- Это fail-closed интеграция политики отправки, а не включение E2E в интерфейсе.
- `protocolReady` остаётся `false`; ни одна переписка не переводится в `required` этой итерацией.
- Зашифрованный composer/timeline path ещё не завершён: локальная E2E-история не объединена с обычным рендерером/пагинацией.
- Миграции не запускались на PostgreSQL; настоящий Supabase Relay/Realtime и два независимых аккаунта не проверялись.
- Production Supabase, GitHub и Cloudflare не изменялись.

## Production Supabase read-only audit (Iteration 146)

- Project `xxvcsaomkyknudoaixbs` is `ACTIVE_HEALTHY`, PostgreSQL 17.11.
- Migration history still ends at `20261121094616` (`rim_iteration_135_poll_vote_author_visibility`). Migrations 136, 142, 143 and 145 are not applied.
- `public.conversations` has no `e2e_mode`, `e2e_epoch` or `e2e_protocol` columns. `public.chat_messages` has no `encryption_version` or `encrypted_payload` columns.
- The legacy `rim_e2e_devices`, `rim_e2e_signed_prekeys` and `rim_e2e_one_time_prekeys` tables exist with RLS enabled, but each currently reports 0 rows.
- The new `rim_e2e_relay_*` tables are absent. `rim-e2e-relay` is not present in the deployed Edge Function list.
- All checks above were read-only. No migration, SQL mutation, Edge Function deployment or production data change was performed.
