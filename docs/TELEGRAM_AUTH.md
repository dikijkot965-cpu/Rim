# Telegram OIDC вход (RIM)

## Публичный URL

`https://dikijkot965-cpu.github.io/Rim/`

Указать **точно** (со слешем в конце):

1. Telegram Bot → OIDC / Login redirect URI
2. Supabase Edge Function secret `TELEGRAM_REDIRECT_URI`

Клиент на `*.github.io` шлёт этот канонический URI (см. `TelegramAuthService`). В authorization request используется `prompt=login`, чтобы не переиспользовать молча старую Telegram-сессию.

Секреты Edge Function `telegram-auth`:

```
TELEGRAM_CLIENT_ID=9041438103
TELEGRAM_CLIENT_SECRET=<secret>
TELEGRAM_REDIRECT_URI=https://dikijkot965-cpu.github.io/Rim/
```


## Если Telegram показал сообщение об успешном входе в Telegram Widgets, но RIM не открылся

Это уведомление Telegram о входе в сторонний сайт/виджет не доказывает, что RIM получил OIDC callback. Для входа RIM обязателен возврат в браузер на `https://dikijkot965-cpu.github.io/Rim/` с параметрами `code` и `state`. Затем приложение вызывает Edge Function `telegram-auth`, проверяет PKCE/state/nonce, обменивает код, проверяет ID token и создаёт Supabase session.

Проверить:

1. В адресной строке после Telegram должен открыться URL РИМа с `?code=...&state=...` (не отправляйте эти значения никому и не публикуйте скриншот с ними).
2. В Telegram OIDC app redirect URI должен совпадать посимвольно: `https://dikijkot965-cpu.github.io/Rim/`.
3. Supabase Edge Function secret `TELEGRAM_REDIRECT_URI` должен совпадать с ним, включая `/Rim/` и завершающий `/`.
4. `TELEGRAM_CLIENT_ID` и `TELEGRAM_CLIENT_SECRET` должны принадлежать тому же OIDC app. Не использовать legacy Telegram Login Widget token вместо OIDC client secret.
5. В Supabase Function Logs должна появиться запись `telegram-auth` после callback. Если записей нет, callback не дошёл до функции; исправлять нужно redirect URI / Telegram OIDC configuration, а не базу сообщений.
6. Если функция вызвана, но app не открылся, посмотреть статус ответа и текст на `authScreen`; в iteration 134 добавлена явная ошибка при сбое `initializeApp`.

В ходе расследования iteration 134 в sampled logs не было вызовов `telegram-auth`. Это значит, что для того конкретного окна нельзя подтвердить, что RIM получил callback. Повторный тест на реальном устройстве обязателен.
