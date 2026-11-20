# RIM — строгий вход только по seed-фразе

## Модель безопасности

Seed-фраза RIM поддерживает два собственных формата: 24 слова (184 бита энтропии + 8-битный SHA-256 checksum) и 12 слов (128 бит энтропии + 4-битный SHA-256 checksum). 12-словный формат использует отдельный словарь из 2 048 составных токенов RIM. Ни один формат не совместим с BIP-39, не является приватным ключом криптокошелька и не шифрует переписку.

При обычном использовании фраза восстановления одноразовая: сервер атомарно помечает её использованной. В режиме `seed_only` она становится постоянным фактором входа до ротации пользователем. Это два разных сценария и два разных серверных состояния.

## Как будет работать seed-only

1. Пользователь подтверждает действующую 12- или 24-словную фразу.
2. Edge Function генерирует случайную соль и выводит из фразы длинный пароль входа через PBKDF2-HMAC-SHA-256 (600 000 итераций). Производный пароль не показывается и не сохраняется в RIM-коде.
3. Сервер меняет пароль Supabase Auth на производный секрет. Старый пароль перестаёт работать.
4. В БД создаётся запись `pending`, привязанная к текущему `session_id`; другие серверные сессии отзываются.
5. После успешной смены пароля состояние становится `active`.
6. Custom Access Token Hook разрешает для seed-only аккаунта только password-authentication (пароль при этом вычисляется из seed-фразы) и refresh уже авторизованной сессии. OAuth, magic link и OTP отклоняются.
7. Дополнительная restrictive RLS policy проверяет `session_id` для всех RLS-защищённых таблиц `public`, `storage.objects` и `realtime.messages`. Старый JWT без записи в таблице seed-сессий не получает доступ к данным даже до своего естественного истечения.

Email используется сервером как внутренний идентификатор Supabase Auth; пользователь при seed-входе вводит только фразу. Знание email не даёт права войти.

## Что уже подготовлено в Supabase

- Независимый 256-битный pepper сгенерирован внутри Postgres и хранится зашифрованным в Supabase Vault (`rim-recovery-pepper-v1`). Он не хранится в репозитории и не возвращается Edge Function.
- `public.rim_hash_recovery_credential` возвращает только HMAC-дайджест; выполнить её может только `service_role`.
- Новые recovery-коды и seed-фразы используют `hash_version = 3`. Старые дайджесты `hash_version = 1` остаются проверяемыми прежним HKDF derivation.
- Созданы закрытые таблицы `private.rim_seed_only_accounts`, `private.rim_seed_only_sessions` и `private.rim_security_config`; клиентские роли не имеют к ним прямого доступа.
- Создан `public.custom_access_token_hook` с `SECURITY INVOKER`. Доступ к закрытым таблицам выдан `supabase_auth_admin` через отдельные RLS policies.
- Добавлена restrictive RLS-проверка seed-сессии для всех RLS-защищённых таблиц `public`, `storage.objects` и `realtime.messages`.
- Подготовлены двухфазные RPC `rim_seed_only_begin`, `rim_seed_only_activate`, `rim_seed_only_cancel_pending`. Они доступны только `service_role`; старый одноступенчатый RPC отозван.
- В Dashboard подключён `public.custom_access_token_hook`. Проверены его `SECURITY INVOKER`, права `supabase_auth_admin` и выполнение smoke-test на тестовой идентичности без seed-only записи. `rim-account-security` развёрнут как v12. Readiness-флаг установлен в `true`; seed-only остаётся индивидуальным и добровольным, ни один аккаунт пока не активирован.

## Что ещё не завершено

Серверная инфраструктура и Auth Hook подключены. Остаётся полноценный E2E-прогон на отдельном тестовом аккаунте: проверить password, OAuth, OTP и magic-link отказ, seed-вход, refresh, отзыв старых сессий, отключение режима и восстановление после pending. Это не блокирует готовность функции, но является обязательным контрольным испытанием перед массовым включением.

Не включайте seed-only, пока не сохранили фразу офлайн и не прошли проверку трёх случайных слов. Включение меняет облачный пароль и может потребовать повторного входа через seed.

## Перебор и хранение

- Фраза проверяется по 12 или 24 словам и checksum до обращения к хранилищу.
- Rate limit хранится в Postgres, а ключи ограничения хешируются отдельным Vault pepper.
- Для seed-login действуют лимиты на IP (8 попыток за 15 минут), найденный аккаунт (8 за 15 минут) и конкретный digest фразы (5 за час).
- Edge Function принимает только POST, не кеширует ответы, ограничивает размер тела и использует Cloudflare-provided `cf-connecting-ip`, не доверяя произвольному `X-Forwarded-For`.
- Исходная фраза не должна попадать в БД, аналитику, логи, админ-панель или телеметрию.
- Пользователь должен хранить фразу офлайн в двух защищённых местах. Скриншот в облачной галерее, переписка с самим собой и заметка без дополнительной защиты — плохие места хранения.

## Важные ограничения

- Seed-only не делает аккаунт полностью анонимным: остаются сетевые и сервисные метаданные.
- 184 бита энтропии — уже очень высокий запас, но текущий формат не следует рекламировать как 256-битный. Pepper имеет 256 бит, но это отдельный серверный ключ, а не энтропия фразы.
- Встроенная защита Supabase от скомпрометированных паролей отключена. Организация проекта сейчас на Free-плане; встроенная проверка Have I Been Pwned требует Pro или выше. Не заявлять, что она включена.
- Включение seed-only необратимо для пользователя, который потерял фразу и не имеет активной сессии. Перед подтверждением интерфейс обязан предупредить об этом.


## Iteration 130 — 12/24-word phrase formats

RIM now supports two custom mnemonic formats. The 24-word format retains 184 bits of random entropy plus an 8-bit SHA-256 checksum. The shorter 12-word format uses a separate 2,048-token RIM dictionary, 128 bits of random entropy and a 4-bit SHA-256 checksum. The 12-word tokens are hyphenated combinations of familiar roots and are not BIP-39 words or compatible with wallet seed phrases. Both formats are validated on the client and server; only the Vault-peppered HMAC digest is stored.

The 12-word format is the standard/short option; the 24-word format is the maximum-strength option. Neither format encrypts message content or hides network metadata.
