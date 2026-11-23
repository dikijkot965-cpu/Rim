# RIM 4.1.8 — Iteration 151

Дата: 2026-11-21

## Что изменено

- Усилена защита отправки голосовых сообщений при смене аккаунта или активной переписки во время E2E scope preflight.
- Голосовой файл теперь не загружается, если контекст уже изменился после проверки E2E.
- Если аккаунт или переписка меняются во время загрузки голосового файла, загрузка прекращается до создания строки сообщения, а уже загруженный объект удаляется.
- Добавлены проверки контекста после вставки сообщения и вложения; при обнаружении переключения выполняется best-effort rollback сообщения и удаление файла.
- Аналогичная защита добавлена для отправки изображений: после E2E preflight и после загрузки проверяется неизменность пользователя и переписки. При переключении во время upload файл удаляется, а строка сообщения не создаётся.
- Добавлены регрессионные тесты на смену аккаунта во время scope preflight и storage upload для голосовых и фото-вложений.

## Аудит путей сообщений

- Основные клиентские insert-пути `chat_messages` обнаружены в message repository, voice controller, forward service и push/bot server functions.
- Голосовые, изображения, стикеры, forwarding и outbox имеют клиентские E2E preflight guards в актуальных путях.
- Bot API отправляет через service-only RPC; миграция 136 содержит DB BEFORE INSERT guard, который блокирует plaintext `chat_messages` в E2E-required scope. Этот барьер ещё не проверен на PostgreSQL runtime и не развёрнут в production.
- Push preview читает `body`; E2E payload не должен помещать plaintext в это поле. В этой итерации push payload/notification архитектура не менялась.
- Channel feed media upload — отдельный `channel_posts` путь и требует отдельного аудита приватных каналов; он не считается подтверждённо защищённым этой итерацией.

## Ограничения

- `protocolReady=false`; E2E не активировано.
- Миграции не применялись, Edge Functions не развёртывались.
- Нет live Supabase two-account test, PostgreSQL runtime migration validation, Android/OPFS validation.
- Никаких production Supabase, GitHub или Cloudflare изменений.
