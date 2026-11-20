# RIM 4.1.2 — инженерный отчёт, итерация 129

**Дата:** 20 ноября 2026  
**База:** RIM 4.1.1 / iteration 128  
**Статус:** исходники и миграции подготовлены; production изменения применены частично; E2E/staging/mobile/load проверки ожидают внешних условий.

## 1. Seed-фраза и безопасность аккаунта

- Создан независимый 256-битный recovery pepper внутри Supabase Vault. Edge Function получает только HMAC-дайджест через service-role-only RPC, а не сам pepper.
- Новые recovery-фразы и коды хешируются с `hash_version=3`; старые записи версии 1 продолжают проверяться прежним HKDF derivation.
- Добавлены закрытые таблицы seed-only аккаунтов и сессий, Custom Access Token Hook и restrictive RLS session gate.
- Все 88 таблиц `public` имеют включённый RLS. Restrictive seed-session gate добавлен к RLS-защищённым таблицам `public` и `storage.objects`.
- Функции `rim_seed_only_begin`, `rim_seed_only_activate`, `rim_seed_only_cancel_pending` проверены на grants: доступны только `service_role`. Старый одноступенчатый `rim_seed_only_enable` отозван у всех клиентских ролей и `service_role`.
- `custom_access_token_hook` работает как `SECURITY INVOKER`; доступ к приватным таблицам предоставлен `supabase_auth_admin` через RLS.
- Readiness остаётся `false`, пока Auth Hook не выбран в Dashboard и двухфазная Edge Function не развернута. Production `rim-account-security` — ACTIVE version 10; локальный исходник уже содержит двухфазную последовательность, но не опубликован.
- Защита Supabase от скомпрометированных паролей отключена. Организация Supabase на Free-плане; встроенная функция требует Pro или выше.

## 2. Каналы: шаг к Telegram-подобной модели

- Добавлена стабильная cursor-pagination публикаций по паре `created_at + id`.
- Добавлены закреплённые публикации, список закреплённых постов и серверный RPC с проверкой владельца/администратора.
- Добавлены индексы `(channel_id, created_at DESC, id DESC)` и частичный индекс закреплённых публикаций.
- Существующие реакции, комментарии и опросы сохранены.

Это ещё не полный клон Telegram-каналов. Следующие крупные блоки: медиагруппы/альбомы, видео и документы, отложенные публикации, счётчики просмотров, пересылка из каналов, расширенные права администраторов, настройки реакций и полноценная статистика канала.

## 3. Радио

- Добавлены «Радио Звезда», «Радио Ваня», «Радио МИР», «Радио Монте-Карло», «Монте-Карло Gold» и «DFM Дискач 90-х».
- Добавлены избранные станции, таймер отключения и автоматическое переподключение с ограниченным backoff.
- Уже существующие «Детское радио», «Дорожное радио», «Маруся FM» и «Маяк» сохранены.
- Реальные эфиры пока не подтверждены на физическом Android-устройстве; адреса потоков могут изменяться или иметь региональные ограничения.

## 4. Локальная блокировка приложения

- Добавлен выбор PIN-кода (8–16 цифр) или графического ключа (минимум 6 различных точек).
- Проверочный материал хранится как PBKDF2-SHA-256 verifier с 310 000 итераций и случайной солью; исходный PIN/рисунок не сохраняется.
- Есть автоблокировка при возврате из фона и блокировка при новом запуске.
- Это локальный барьер приватности, не серверная аутентификация: он не отзывает Supabase-сессию и не защищает от человека, который может очистить/прочитать профиль браузера.

## 5. Проверка адресации сообщений

- Direct chat создаётся RPC `start_direct_chat(uuid)`: канонический `direct_key` строится из отсортированной пары UUID, в переписку добавляются ровно два участника.
- `MessageRepository` вставляет сообщение с `conversation_id` и `sender_id`; повторная отправка защищена уникальным ключом `(sender_id, client_message_id)`.
- INSERT policy проверяет `sender_id = auth.uid()` и членство в `conversation_members`.
- SELECT policy допускает чтение только участникам переписки.
- UPDATE и DELETE policies дополнительно исправлены: автор должен оставаться участником переписки. Это закрывает случай изменения/удаления собственного сообщения после потери членства.
- Realtime/клиентские фильтры не считаются границей безопасности; окончательная проверка выполняется RLS.

## 6. Автоматические проверки

- `npm test`: **424/424 PASS**.
- `npm run check`: **108 модулей**, PASS.
- `npm run check:syntax`: **284 JS-файла**, PASS.
- `npm run audit:html`: 74 `innerHTML` места; 7 требуют ручного review, остальные классифицированы как static/OK.
- Deno не установлен, поэтому Edge Function TypeScript проверен только синтаксически через Node type-stripping, не полным Deno type-check.
- Playwright отсутствует; установка зависимости завершилась тайм-аутом. Полные E2E не запускались.
- Два независимых Auth аккаунта, физический Android и нагрузка не тестировались.

## 7. Остаточные performance/security findings

- Performance advisor: 36 multiple-permissive-policy warnings remain. Most are deliberate overlaps (for example public-read plus owner/admin access); they require per-table review and were not removed blindly.
- Performance advisor: 102 unused-index INFO findings remain. The count includes new FK indexes that have not yet been exercised by meaningful production traffic; they are not dropped automatically.
- No unindexed-FK or auth-initplan findings remain after this iteration.

## 8. Внешние блокеры

- Создание Supabase staging branch стоит **$0.01344 в час**. Ветка не создана до явного согласия пользователя на эту тарификацию.
- Supabase Auth Hook требует однократного выбора в Dashboard. Readiness не включать до этой настройки и публикации Edge Function.
- Built-in leaked-password protection недоступна на текущем Free-плане организации; требуется Pro или выше.
- Физический Android-аппарат недоступен для удалённого тестирования; браузерная мобильная эмуляция не дала надёжного завершённого результата.
- Cloudflare build выполнен (147 Worker assets, 148 Pages-only files); deploy не выполнялся. GitHub push также не выполнялся.
