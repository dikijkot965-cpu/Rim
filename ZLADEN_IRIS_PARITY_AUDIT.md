# Злыдя — аудит соответствия функциональной карте Iris (Iteration 177)

Это аудит фактически реализованного в RIM кода и SQL, а не обещание полной совместимости с Iris. У Iris несколько версий и наборы функций отличаются; ниже сравнение только с предоставленным пользователем перечнем.

## Реализовано или частично реализовано

| Направление | Состояние RIM | Что реально есть |
|---|---|---|
| Модерация | Частично | Варны и снятие, mute/unmute, kick, ban/unban, правила и приветствия группы, антифлуд. Нет полной системы удаления одного/массовых сообщений, полного конструктора фильтров ссылок/лексики и полноценной системы прав реакций. |
| Антиспам | Частично | Включаемый антифлуд с ограничением частоты и повторов. Нет общей внешней базы спамеров, проверки возраста аккаунта, captcha/вопросника при входе или Telegram Business проверки собеседника. |
| Ранги и права | Частично | Групповые роли/ранги, централизованные разрешения и алиасы команд. Нет полной модели VIP и всех независимых индивидуальных полномочий Iris. |
| Экономика | Частично | Виртуальные балансы, ledger, перевод/выдача очков, daily, магазин, инвентарь и внутренняя торговая площадка. Это не покупка реальных денег и не система ставок. |
| Игры | Частично, расширено в 177 | Кубик, случайное число, выбор, случайный ответ, процент, выбор участника, случайная команда из двух участников, игровая статистика. Нет полного набора Iris, золотых кубов, дуэлей и погодного сервиса. |
| Социальные взаимодействия | Частично | Нейтральные действия рукопожатия, «дай пять», поздравления, похвалы и извинения; случайные команды. Виртуальные браки, романтические статусы, разводы и рейтинги пар не реализованы. |
| RP | Частично | Несколько встроенных нейтральных действий. Нет пользовательского конструктора до 50 RP-команд и отдельной VIP-иерархии команд. |
| Профили | Частично | Анкета, просмотр профиля, приватность, bio/tag. Нет полного профиля с городом, семейными/романтическими статусами и расширенной историей. |
| Репутация и награды | Частично | Репутация, выдаваемые награды, рейтинги/топы и внутренняя статистика. |
| Аналитика | Частично | Счётчики сообщений, базовая статистика группы и игровая активность. Нет полноценной панели дневных/недельных графиков по всем показателям. |
| Закладки и заметки | Реализовано частично | Личные заметки и закладки сообщений. Нет всех коллекций/организационных сценариев Iris. |
| Автоматизация | Частично | Триггеры по тексту и вступлению, напоминания, алиасы и права команд. |
| Кланы | Реализовано как отдельная подсистема | Создание, вступление, приглашения, роли, приватность, исключение, топ. Кланы не равны сетке чатов Iris. |

## Не реализовано как полноценные подсистемы

- Сетка чатов с объединением групп, синхронизацией настроек и межчатовыми административными операциями.
- Каталог групп с категориями, картой и поиском участников по добровольно указанному городу.
- Полноценная система виртуальных браков/отношений и рейтингов пар.
- Полный набор VIP/платных возможностей.
- Telegram Business: RIM не подключён как Telegram Business-бот для анализа личных собеседников.
- Полноценные персональные клон-боты Iris с произвольным именем/аватаром и полным наследованием инфраструктуры Iris. В RIM есть отдельные bot workspace/runtime-компоненты, но это не равно клонам Iris.
- Полная совместимость команд и данных с Iris. Злыдя — отдельная реализация, не импортирует базу Iris.

## Что добавлено в Iteration 177

- Новые групповые мини-игры и нейтральные социальные действия, с серверной записью метаданных активности.
- Игровые команды не исполняются в E2E `pending`/`required` переписках.
- Нет денежных ставок, пари, покупки шанса или cash-out механик.

## Следующие крупные этапы для достижения более близкого паритета

1. Полноценный moderation rules engine: удаление сообщений, массовая очистка, фильтры ссылок/слов, join verification, журнал действий и делегирование модерации.
2. Полный social graph: запросы на дружбу/команду, взаимные согласия, списки и рейтинги без навязывания романтических механик.
3. Полный профиль/репутация/достижения с историей и настройками приватности.
4. Аналитическая панель с дневными/недельными агрегатами.
5. Сети сообществ и каталог групп с добровольной географией.
6. Расширение RP-конструктора и игровой библиотеки.
7. Расширение bot workspace после отдельного threat-model и sandbox-аудита.

**Итог:** Злыдя уже больше простого модератора, но это ещё не полный аналог Iris. Особенно отсутствуют сетки чатов, каталог/география, полный social graph, VIP и Business. Эти пробелы не следует считать реализованными только потому, что соответствующие пункты есть в общем списке функций.

## Iteration 178
- Public channel posts can be manually cross-posted by managers or mirrored at publish time; source references are unique and server-validated. Private and E2E channels are excluded.
- Home feed text and selected topics autosave per account. File bytes are not persisted in local drafts.
- Zladen gained configurable link filtering and administrator-defined word/phrase filters: `/filter links on|off`, `/filter word add|del`, `/filter words`, `/filter status`. Server-side enforcement skips E2E pending/required scopes.
- Remaining Iris parity gaps include social relationships, cross-chat networks, community directory/geography, VIP/Business and a richer automatic moderation suite.


## Iteration 184 — parity status update

This iteration improves command discoverability and stability but **does not complete Iris parity**.

### Retained / currently available in Zladen
- Group moderation: bans, mutes, warnings, roles and command permissions.
- Anti-spam and content/link/word filters.
- Economy: wallets, ledger, daily claims, inventory and market listings.
- Games, quiz sessions, game events and group statistics.
- Polls and poll votes.
- Triggers, reminders, command aliases and custom commands.
- Clans, clan membership and invites.
- Reputation, awards, notes, bookmarks and reports.
- Group console presets and command-specific `/help <command>`.

### Iteration 184 changes relevant to Zladen
- Kept the help trigger after chat topic validation, encrypted-message guards, direct-message block checks, group controls and content filters.
- Prevented the help trigger from taking over pending/required/secret E2E conversations.
- Kept help descriptions for built-in commands, group custom commands and aliases.
- No new claim is made that every Iris command exists or has equivalent semantics.

### Still missing for genuine parity
1. Cross-chat networks: connected group sets, shared settings, delegated admin actions and network-level audit.
2. Community catalog: categories, discovery, member opt-in city metadata and geographic search.
3. Full social graph: mutual friend/team relationships, relationship state transitions and user-controlled privacy.
4. Full virtual relationship system: marriages, partner ratings and lifecycle commands.
5. VIP tiers and all associated command limits/permissions.
6. Telegram Business integration.
7. Full clone-bot provisioning, isolated credentials, owner controls, per-clone storage and sandboxing.
8. Complete Iris command compatibility and data migration.

### Porting rule
Each missing feature must be implemented as a complete vertical slice: command parser/UI, domain rules, application service, server-side RPC/Edge Function, RLS, audit log, migration, tests and command-specific help. A command name or help description without that vertical slice is not considered implemented.


### Iteration 184 — additional Iris-style commands actually implemented
- Games: `/dice` alias for `/roll`, `/golden_dice`, `/pair_all`, `/ping`.
- RP: `/hug`, `/pat`, `/tea`, plus existing `/highfive`, `/handshake`, `/congrats`, `/praise`, `/apologize`.
- Help: `/help <command>` now explains these commands and existing random/choice/yes-no/percent/game-stat commands.
- Production DB transactional tests with the bot installed in a group confirmed golden dice, help descriptions, pair-all, hug and dice alias responses.

### Remaining Iris parity from the user's saved feature list
- Duels and duel lifecycle; weather command with a real weather provider; full marriage/relationship lifecycle; full common-pairing/social graph; cross-chat networks; community catalog/geography; VIP tiers; Telegram Business anti-spam parity; clone-bot provisioning; full command compatibility and up to 50 configurable RP actions.
- Existing economy, moderation, rank/permission, triggers, polls, reminders, clans, bookmarks, rewards and custom-command subsystems remain the foundation; each remaining feature still needs a complete server/RLS/UI/test vertical slice.
