# Злыдя — архитектура платформы (Iteration 140)

## Архитектурный принцип

Злыдя — системный RIM-аккаунт и набор серверных модулей. Сообщение пользователя проходит через один SQL command-dispatch pipeline, а не через набор клиентских обработчиков. Состояние профиля глобально, настройки/права/модерация/статистика локальны для конкретной беседы там, где это необходимо.

## Текущий поток сообщения

1. Клиент RIM записывает сообщение в `chat_messages`.
2. BEFORE INSERT triggers проверяют mute и, если включён, антифлуд. Антифлуд не анализирует беседы `e2e_mode='required'`.
3. После успешной вставки metadata-only trigger обновляет счётчик сообщений.
4. Существующий moderation handler Iteration 137 обрабатывает правила, приветствия, предупреждения, mute/ban и custom text commands.
5. Extended handler Iteration 138 обрабатывает профиль, внутренние жетоны, репутацию, заметки, жалобы, должности, награды и настройки антифлуда.
6. Отдельный onboarding trigger приветствует саму группу при добавлении бота и новых участников при вступлении; `/menu` показывает каталог доступных команд; упоминание бота использует актуальный username, `/who` принимает UUID или username.
7. Ответ Злыди записывается как обычное сообщение с детерминированным `client_message_id`, поэтому повторная обработка не должна создавать дубликат.

## Границы доверия

- Auth user ID — первичный идентификатор; username и отображаемое имя не используются для авторизации.
- Роли проверяются на сервере при каждом вызове. Клиентские кнопки не могут быть источником истины.
- Встроенные creator/admin роли имеют приоритет над пользовательскими должностями.
- Прямой доступ к новым таблицам закрыт RLS и revoke grants.
- Внутренние жетоны не являются деньгами и не имеют cash-out или внешней ценности.
- Пользовательский код не исполняется в SQL-триггерах. Триггеры описываются JSON и должны выполнять только allowlisted actions.
- Злыдя полностью исключён из E2E-required scopes: серверный бот не может быть частью сквозного приватного потока, пока не появится отдельная осознанная модель ботов в E2E.

## Схема модулей

- Identity/Profile: `rim_zladen_user_profiles`.
- Group roles/permissions: `rim_zladen_chat_roles`, `rim_zladen_command_permissions`, `rim_zladen_command_aliases`.
- Moderation: миграция 137 (`warnings`, `mutes`, `bans`, `audit`).
- AntiSpam/Triggers: `rim_zladen_antispam_settings`, `rim_zladen_rate_buckets`, `rim_zladen_triggers`, `rim_zladen_trigger_logs`.
- Economy: `rim_zladen_wallets`, `rim_zladen_ledger`.
- Reputation/Awards: `rim_zladen_reputation_events`, `rim_zladen_award_catalog`, `rim_zladen_user_awards`.
- Knowledge/Reports: `rim_zladen_notes`, `rim_zladen_bookmarks`, `rim_zladen_reports`.
- Engagement: `rim_zladen_polls`, `rim_zladen_poll_votes`, `rim_zladen_clans`, `rim_zladen_clan_members`.
- Scheduling: `rim_zladen_reminders` — storage only until a durable worker is deployed.
- Statistics: `rim_zladen_chat_member_stats` — message counters and timestamps only.

## Group onboarding

- Admin opens group settings and presses **Подключить Злыдю к группе**.
- RIM reads the bot public username through authenticated Edge Function action `public_profile`.
- Existing `rim_group_add_member` RPC adds the bot account; the UI does not write membership directly.
- A database trigger posts one deterministic onboarding message, then the menu can be opened with `/menu`.
- Member welcome substitutions: `{user}`, `{user_id}`, `{count}`.
- No onboarding, welcome or command trigger runs in `e2e_mode=required`.

## Command control (Iteration 140)

- `/alias add псевдоним команда`, `/alias del псевдоним`, `/aliases` управляют псевдонимами, ограниченными одной беседой. Встроенные имена зарезервированы.
- `/setcommand команда on|off [ранг]` задаёт индивидуальный доступ; `/commands` показывает исключения.
- `rim_zladen_command_gate` выполняется BEFORE INSERT, то есть до обоих прежних command dispatchers. Алиасы сначала приводятся к канонической команде для проверки прав; ограничение нельзя обойти синонимом.
- Внутренний alias dispatch помечается приватной транзакционной записью в схеме `private`; клиентское поле `client_message_id` не является механизмом доверия.
- `/settings` показывает настройки беседы; `/reports` и `/reportresolve` дают администраторам очередь и обработку жалоб.
- Эти обработчики также пропускают `e2e_mode=required`.

## Следующие инженерные этапы

1. Проверить миграции 136–138 на отдельной копии PostgreSQL схемы RIM; исправить любые schema/type mismatches.
2. Написать integration tests на реальные транзакции, concurrency, RLS, role escalation, idempotency, антифлуд и ban/mute.
3. Реализовать SQL RPC для личных настроек, закладок, голосований, напоминаний и управления сетками.
4. Поднять durable scheduler/queue и доставку напоминаний с retry + idempotency.
5. Создать UI панели Злыди в RIM, не полагаясь на slash-команды как единственный интерфейс.
6. Добавлять сетевую модерацию и глобальный каталог только после проектирования согласия, апелляций и минимизации данных.

## Что не заявляется

Iteration 140 не является полным Iris clone. Некоторые таблицы — фундамент, а не готовые пользовательские функции. SQL ещё не запускался в PostgreSQL в этой среде; production migration и deployment не выполнялись.
