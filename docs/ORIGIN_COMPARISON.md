# Сравнение: первый «Мини-чат» vs RIM 4.0.0-iteration.65

## Краткий вердикт

Это **разные продукты по классу**, а не «тот же файл, чуть почищенный».

Первый код — одностраничный прототип глобальной ленты сообщений с именем в `localStorage`.  
Текущий RIM — мессенджер с диалогами, каналами, группами, правами, modular application-слоем и гибридным legacy, при этом **UI-контракт продукта заморожен отдельно от того первого HTML**.

Сходство: оба ходят в Supabase из браузера и рисуют сообщения.  
Различие: почти всё остальное.

## 1. Форма и объём

| | Первый мини-чат | RIM сейчас |
|--|-----------------|------------|
| Поставка | Один HTML (~120–150 строк) | Проект: `src/`, `assets/js/legacy/` (~24 файла), composition roots, tests, docs |
| Bootstrap | `window.onload` + inline script | ES modules, DI container, lifecycle, health |
| Стили | Inline `<style>` | Отдельный CSS/продуктовый shell (дизайн RIM, не мини-чат) |
| Тесты | Нет | 275 automated tests |

## 2. Идентичность и безопасность

| | Первый | RIM |
|--|--------|-----|
| «Пользователь» | Строка имени, `localStorage` | Auth-сессия Supabase, профили, роли |
| Ключи | URL и publishable key **в странице** | Клиент через legacy context / конфиг окружения; не как «весь бэкенд» |
| Доступ к данным | Фактически общая таблица `messages` | Membership, RLS на стороне БД как авторитет, репозитории с scoped reads |
| Блокировки / privacy | Нет | block list, privacy settings, presence visibility |

Имя в localStorage ≠ аккаунт. Любой мог писать от любого имени.

## 3. Модель данных и продукт

| | Первый | RIM |
|--|--------|-----|
| Сущность чата | Одна глобальная лента | Conversations (direct/group), channels, topics |
| Сообщение | `{ user_name, text }` | Тело, вложения, reply, reactions, forward, voice, stickers, read state… |
| Список чатов | Нет | Список, unread, activity, favorites |
| Каналы / группы | Нет | Directory, feed, settings, roles, invites |
| Админка | Нет | Roles, ads, notices, sessions, stats |

## 4. Realtime и загрузка истории

| | Первый | RIM |
|--|--------|-----|
| Подписка | Один channel на INSERT в `messages` | Conversation-scoped timeline + state realtime |
| История | `select` limit 50, полная перерисовка | Cursor pagination, load older, race guards |
| Открытие чата | Нет понятия «открыть диалог» | Coordinator + modular open service, navigation tokens |

## 5. Архитектура кода

| | Первый | RIM |
|--|--------|-----|
| Слои | Всё в одном `<script>` | application / infrastructure / composition / features / legacy |
| Ownership | Нет | `__RIM_*_OWNED` flags, dual-bind guards |
| Ошибки | `alert` | Result/notify/logger patterns в modular path |
| Расширяемость | Копипаст в тот же файл | Surfaces: settings, channels, groups, social, admin, shell, timeline, session… |

Composition roots (11): chat-audience, settings, channels, groups, social, admin, shell, message-commands, chat-runtime, message-timeline, conversation-session.

## 6. Что *не* изменилось по духу

- Клиент по-прежнему **браузерный** и завязан на Supabase API.
- Нет отдельного messaging-backend уровня Telegram/WhatsApp.
- До «миллиарда пользователей» по-прежнему нужна **другая** серверная архитектура; модульность лишь готовит клиентский контур.

## 7. Насколько «сильно отличается» — шкала

- **Визуально / UX:** полностью другой продукт (RIM shell), не мини-чат с `border-radius: 28px`.
- **Домен:** от «одна комната» до «мессенджер с сущностями».
- **Инженерия:** от учебного сниппета до гибридной modular+legacy системы с тестами.
- **Генеалогия:** RIM вырос из длинной эволюции поверх Supabase-чата, но **не является рефакторингом того HTML один-в-один**. Прямой потомок по идее «чат на Supabase», не по структуре файла.

## 8. Честная оценка прогресса

Первый файл решал: «показать, что INSERT/SELECT/Realtime работают».  
RIM решает: «собрать продуктный клиент с границами модулей, не ломая UI, и постепенно убрать dual ownership».

До maintainable modular core — ещё порядка десятка итераций пути dual-bind/parity.  
До hyperscale — отдельный backend-трек, не продолжение этого HTML.
