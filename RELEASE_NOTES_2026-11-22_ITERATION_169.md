# RIM 4.1.8 — Iteration 169 (backend reconciliation package)

## Основа

Пакет собран на последнем доступном в Library ZIP `RIM_4.1.8_ITERATION_163_FIXED_FULL.zip` (922 файлов, ZIP integrity OK). Ветка приложения не переписывалась с нуля.

## Что изменено

- Удалён только `.github/workflows/deploy-rim-project-zip.yml`: ручная загрузка ZIP не должна запускать workflow полной замены репозитория.
- Добавлен исходник `supabase/functions/rim-e2e-device-link/index.ts`, синхронизированный с активной функцией Supabase `rim-e2e-device-link` (JWT verification включена). Он содержит серверные действия begin/request/status/approve/register и проверку подписи Ed25519.
- Добавлена инструкция ручной загрузки с Android и перечень путей, которые нельзя удалять.
- Добавлено описание расхождения между архивом Iteration 163 и текущей живой схемой Supabase.
- В активной базе применена отсутствовавшая миграция Zladen group-arrival (139): приветствие при добавлении Злыди в группу, приветствие новых участников и `/menu`. Триггеры пропускают переписки с `e2e_mode='required'`.

## Фактическое состояние живого Supabase на 2026-11-22

- Project ref: `xxvcsaomkyknudoaixbs`, ACTIVE_HEALTHY.
- `rim-e2e-relay`: ACTIVE v2, `verify_jwt=true`.
- `rim-e2e-device-link`: ACTIVE v1, `verify_jwt=true`.
- `rim-zladen`: ACTIVE v1, `verify_jwt=true`.
- В migration history есть E2E 164, 165, 165a, 167, 168 и Zladen 136, 137, 138, 140, 141. Migration 139 была применена в этой сессии.
- Схема содержит `conversations.is_secret`, `e2e_mode`, `e2e_epoch`, `rim_e2e_device_link_requests` и RPC для создания секретного direct chat / активации E2E scope.

## Что не следует считать завершённым

- Серверная функция привязки устройства есть, но UI QR pairing, проверка кода на обоих устройствах, SDK state transfer и синхронизация истории ещё не интегрированы в клиентский runtime.
- Runtime из Iteration 163 по-прежнему использует device 1 и держит `protocolReady=false`.
- Локальный encrypted message store уже существует, но локальный поиск по нему не подключён к общему поисковому интерфейсу.
- Signal SDK exchange lab остаётся диагностической проверкой SDK/relay, а не интеграцией всех сообщений RIM.
- Групповой и канальный E2E relay fan-out не объявляется завершённым только на основании наличия схемы scope.

## Проверка архива

ZIP integrity проверяется командой `unzip -t`. Автоматическая сборка нового bundle в этой сессии не выполнена: `npm ci` не завершился в доступное время, поэтому нельзя заявлять о новом production bundle. В архиве сохранены исходный bundle и worker/WASM из Iteration 163.
