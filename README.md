# Императорский Мессенджер (RIM) — инженерная сборка 4.0.0 (текущая итерация 125)

Это продолжение существующего RIM, а не отдельный новый мессенджер. Сохранены исходный имперский интерфейс, HTML-структура основных экранов, Supabase и совместимость с прежними функциями. Работа ведётся вертикальными инженерными срезами: новая логика переносится в модули, а старый интерфейс остаётся совместимым до подтверждения паритета.

## Что уже перенесено в модульный runtime

- **Личные переписки:** пакетное разрешение собеседников, имён и аватаров; защита от устаревших ответов.
- **История сообщений:** загрузка последних 50 сообщений, курсорная подгрузка старых, инкрементальная обработка Realtime INSERT/UPDATE/DELETE.
- **Команды сообщений:** текст, стикеры, изображения, редактирование и удаление проходят через `MessageCommandService`; старый renderer и разметка composer сохранены.
- **Команды сообщений — защита:** проверка длины текста, MIME/размера фото, блокировка параллельных повторных нажатий, привязка мутаций к текущей переписке и автору.
- **Изображения:** загрузка в `chat-files` с неперезаписывающим UUID-путём; при ошибке записи сообщения предпринимается очистка только что загруженного объекта.
- **Lite Writer:** модульный редактор без обязательного CDN-бандла, список документов, создание, выбор, сохранение и локальный fallback.
- **Избранное и локальная музыка:** вынесены в отдельные feature-модули.
- **Инфраструктура:** контейнер зависимостей, события, журналирование, health checks, disposable lifecycle и единая граница совместимости с legacy.

- **Legacy loader unification:** поздний `rimLoadMessagesStable`, который реально вызывался при открытии чата, теперь направлен в модульный курсорный загрузчик. Старый параллельный загрузчик больше не выполняет отдельный запрос `SELECT *` перед модульной историей.
- **Realtime race protection:** события, пришедшие во время запроса истории или catch-up, повторно применяются к результату чтения; поколение запроса отделено от срока жизни Realtime-подписки.
- **Chat-list query reduction:** удалён устаревший legacy-резолвер собеседников, который делал отдельные запросы участников и профилей. Эту задачу выполняет модульный контроллер; загрузка списка не запрашивает last-seen, а открытие уже разрешённого личного чата обновляет только присутствие.
- **Channel feed staged loading:** заголовок и ограниченная первая страница канала отображаются до загрузки реакций, голосов, авторов и рекламы; комментарии загружаются отдельно только при раскрытии конкретной публикации. Добавлена защита от устаревших ответов при переключении каналов.

## Проверка текущей сборки — итерация 125

Из корня проекта:

```bash
npm run verify
```

Последняя проверка (итерация 125):
- project integrity check — PASS, 105 модулей в карте и 24 legacy-скрипта;
- syntax check — PASS, 277 JavaScript-файлов;
- Node test suite — 399 passed, 0 failed;
- Cloudflare static build — PASS, 144 Worker assets in `dist/` and 145 Pages-only files in `cloudflare-pages/`;
- Playwright E2E — пропущен, так как `@playwright/test` не установлен.

Это автоматические проверки модулей, артефакта публикации и репозитория. Они не заменяют запуск в браузере с двумя реальными аккаунтами и проверку на Android.

## Supabase и ограничения

- Выполнена read-only проверка схемы и политик, относящихся к `chat_messages`, `user_blocks` и Storage bucket `chat-files`.
- В активную базу `xxvcsaomkyknudoaixbs` применена миграция Telegram identity + message idempotency и миграция одноразовых recovery codes. Таблица recovery codes закрыта RLS; прямые SELECT-права отсутствуют у `anon` и `authenticated`.
- Проверка блокировки личных сообщений видит блокировки, созданные текущим пользователем. Политика `user_blocks` не раскрывает чужие блокировки; проверять их на клиенте нельзя без отдельного серверного контракта.
- Offline outbox передаёт `client_message_id`; уникальный индекс `(sender_id, client_message_id)` не допускает повторной вставки одной логической отправки после неопределённого сетевого исхода. Это защищает от дубликатов в БД, но не обещает exactly-once доставку по сети.
- Не проводились Android/two-account E2E и нагрузочные испытания. Нет сертификации на 10 000 одновременных активных пользователей.

## Полная спецификация и учёт миграции

- `docs/RIM_4.0.0_EXECUTION_SPEC.md` — целевая архитектура и этапы миграции.
- `docs/FEATURE_PARITY_MATRIX.md` — реестр функций и их статуса.
- `docs/BASELINE_3.1.0_PRESERVATION_MANIFEST.md` — исходная база сохранения.
- `docs/SUPABASE_PRODUCTION_AUDIT_2026-11-13.md` — предыдущий аудит Supabase.
- `docs/RIM_4.0.0_ITERATION_3_REPORT.md` — отчёт предыдущего прохода.
- `docs/RIM_4.0.0_ITERATION_17_REPORT.md` — подробный отчёт текущего прохода.
- `NEXT_CHAT_HANDOFF.md` — инструкция и точка продолжения в новом чате.

## Важное ограничение объёма

Это не завершённая полная перепись всех legacy-скриптов и не заявление о production-ready. Существующие legacy-модули продолжают обслуживать значительную часть функций ради сохранения поведения. Каждый следующий срез должен мигрировать функциональность с тестами и проверкой совместимости, а не удалять старые механизмы вслепую.


## Iteration 6 — conversation state projection

The application layer now owns conversation activity ordering, unread counters, latest-message previews, read cursor writes, and chat-list/read-state Realtime projection. Unread cursor rows are fetched once; exact per-conversation counts run with bounded concurrency to avoid the former sequential N+1 latency chain. Read cursors use the timestamp of the newest loaded message, not the wall clock, so messages arriving after the loaded page are not silently marked read. The old unread-count, sort-wrapper and chat-list Realtime blocks were removed from three legacy files. The 25 legacy script files themselves remain until their remaining responsibilities have been migrated and verified; no wholesale deletion was performed.


Legacy retirement in iteration 6: one fully unused decorative legacy script was deleted and its `<script>` tag removed (the related ornament layer is globally hidden by the existing stylesheet). The legacy chain is now 24 files rather than 25. Additional duplicate unread, sort and list-Realtime code was removed from three legacy files and the separate `rim-core-release.js`; its remaining presence, typing, voice, music and channel-settings functions stay active until their own migration is complete.

## Iteration 8 — channel directory migration

The channel directory's read model and subscription filter now live in `src/application/channel-directory-controller.js` and `src/infrastructure/supabase/channel-repository.js`. The existing channel-list classes, labels and open/join commands are preserved. The directory uses actual `channel_members` rows for subscription state, selects only the five fields it renders, escapes dynamic values, and ignores stale requests. Legacy `17` still contains join/leave RPCs, moderation, settings and admin utilities; all 24 legacy scripts remain loaded. See `docs/RIM_4.0.0_ITERATION_8_REPORT.md` and `NEXT_CHAT_HANDOFF.md`.


## Историческое состояние — итерация 17 (сохранено для журнала)

- Активный чат и сброс reply-target фиксируются через `ConversationNavigationController`; устаревшая навигация не может перезаписать более новую.
- Подгрузка старой истории блокируется отдельно для каждой переписки.
- Замена Realtime-подписок защищена от гонок при быстром переключении чатов.
- `npm run verify`: 156 тестов пройдены; синтаксис проверен в 93 JavaScript-файлах.
- Браузерная E2E-проверка и проверка реального Supabase в этой итерации не выполнялись.


## Iteration 123 — Telegram identity and resilient offline delivery

### Telegram OIDC

The login screen now prioritizes Telegram. The browser uses Telegram's Authorization Code Flow with PKCE (S256), state and nonce. The authorization code is exchanged only by the `telegram-auth` Supabase Edge Function. That function verifies the Telegram ID token signature against Telegram JWKS and validates issuer, audience, expiry and nonce before mapping the Telegram subject to one Supabase Auth user.

Required Supabase Edge Function secrets (never put these in browser code or SQL):

- `TELEGRAM_CLIENT_SECRET` — the Client Secret issued by BotFather.
- `TELEGRAM_REDIRECT_URI` — exact RIM origin + pathname used by the deployed app, e.g. `https://your-rim-domain.example/index.html`.
- `TELEGRAM_CLIENT_ID` is optional; defaults to the public Client ID `9041438103`.

Register the exact `TELEGRAM_REDIRECT_URI` as an allowed redirect URI in Telegram Login settings. The redirect URI must match exactly. The client ID is public; the client secret remains server-side.

The Edge Function creates a stable `rim_auth_identities` mapping and issues a one-time Supabase magic-link token hash only after Telegram's ID token has been verified. The synthetic internal email is not a contact address and is never displayed to the user.

### Provider placeholders

Google, GitHub and VK are visible as disabled "В разработке" providers. Their provider identifiers are reserved in `rim_auth_identities`; no false claim of working sign-in is made.

### Offline outbox hardening

- Outbox storage is partitioned by Supabase user ID (`rim.outbox.v2.<userId>`).
- Legacy unowned `rim.outbox.v1` records are deliberately not replayed, preventing cross-account delivery.
- Queue writes fail closed if local persistence fails.
- In-flight records are requeued after a restart.
- Retry backoff prevents tight retry loops.
- Each replay carries `client_message_id`; the database unique index on `(sender_id, client_message_id)` prevents duplicate message rows after uncertain network outcomes.
- The active user is checked again before queued sends.

The additive SQL migration is `supabase/migrations/20261119124951_rim_telegram_identity_and_message_idempotency.sql`.


## Iteration 125 — Cloudflare root correction and account recovery

- Release ZIP now has project files directly at its root; no `rim_work/` wrapper hides `package.json` or `wrangler.jsonc` from Cloudflare.
- `npm run build:cloudflare` emits both `dist/` (Workers assets) and `cloudflare-pages/` (static-only Pages upload root). The Pages folder contains no Wrangler config, package manifest, TypeScript, Supabase functions or migrations.
- Cloudflare Pages Git: Root directory `/`, Build command `npm run build:cloudflare`, output directory `cloudflare-pages`. Workers Builds: Root `/`, Build `npm run build:cloudflare`, Deploy `npm run deploy:wrangler`.
- Added 10 one-time 128-bit recovery codes. Only HKDF-derived HMAC-SHA-256 digests are stored; code consumption is atomic and one-time. Codes can issue from Settings and redeem from login screen.
- Applied `20261119135738_rim_recovery_codes.sql` and deployed `rim-account-security` v2 to active Supabase. HMAC key is derived from the server-only service-role key unless optional stable `RIM_RECOVERY_PEPPER` is configured.
- Telegram OIDC remains in Supabase; Cloudflare serves only the client.

See `docs/CLOUDFLARE_DEPLOYMENT.md` for exact Cloudflare settings and `docs/ITERATION_125_ENGINEERING_REPORT.md` for verification and remaining work.
