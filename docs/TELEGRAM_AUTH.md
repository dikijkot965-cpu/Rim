# Telegram OIDC вход (RIM)

## Публичный URL

`https://dikijkot965-cpu.github.io/Rim/`

Указать **точно** (со слешем в конце):

1. Telegram Bot → OIDC / Login redirect URI
2. Supabase Edge Function secret `TELEGRAM_REDIRECT_URI`

Клиент на `*.github.io` шлёт этот канонический URI (см. `TelegramAuthService`).

Секреты Edge Function `telegram-auth`:

```
TELEGRAM_CLIENT_ID=9041438103
TELEGRAM_CLIENT_SECRET=<secret>
TELEGRAM_REDIRECT_URI=https://dikijkot965-cpu.github.io/Rim/
```
