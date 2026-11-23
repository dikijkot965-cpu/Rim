# RIM Bot Platform — iteration 133

## What is deployed

- `rim-bot-manage` (JWT required): create/list/revoke bot identities and rotate their API token.
- `rim-bot-api` (bot token required): `getMe`, `getUpdates`, `sendMessage`, `setMyCommands`.
- Bot identity is a dedicated Supabase Auth user with `app_metadata.rim_bot=true`; the bot's random login password is never returned.
- Bot API tokens are 256-bit random values. Only SHA-256 digests are stored. The plaintext token is returned once at creation/rotation.
- Incoming messages in conversations containing a bot are copied to a bot update queue by a database trigger.
- Bot API sendMessage writes as the bot's own user identity and requires the bot to be a member of the target conversation.
- API rate limits are durable per bot: 30 sendMessage requests/minute, 120 getUpdates requests/minute, 60 other API calls/minute.

## Creating a bot

Open RIM → Инструменты → Боты. Bot project editing and the separate isolated runtime are described in `docs/BOT_RUNTIME_AND_EDITOR.md`. Username must be lowercase Latin letters/digits/underscore and end with `bot`; the profile schema caps it at 24 characters. Save the token immediately. The bot will appear in RIM's user search. Open a direct conversation with it or add it to a group; only then will it receive messages from that conversation.

## API endpoint

`POST https://xxvcsaomkyknudoaixbs.supabase.co/functions/v1/rim-bot-api`

Headers:

- `Authorization: Bearer <BOT_TOKEN>`
- `Content-Type: application/json`

Request examples:

```json
{"method":"getMe"}
{"method":"getUpdates","offset":0,"limit":50}
{"method":"sendMessage","chat_id":"CONVERSATION_UUID","text":"Привет!"}
{"method":"setMyCommands","commands":[{"command":"start","description":"Начать работу"},{"command":"help","description":"Помощь"}]}
```

`getUpdates` returns messages from conversations the bot belongs to. After processing update N, send `offset: N+1`; the server acknowledges earlier updates. Polling is currently supported. Webhook delivery, inline keyboards, callback queries, file uploads/downloads, bot-to-bot permissions, mini-apps and the container runtime is packaged but not yet deployed; it is not active until a persistent host is configured. See `bot-runtime/README.md`.

## Minimal Node.js polling example

Requires Node.js 20+ and an environment variable `RIM_BOT_TOKEN`. Never commit the token to Git.

```js
const endpoint = 'https://xxvcsaomkyknudoaixbs.supabase.co/functions/v1/rim-bot-api';
const token = process.env.RIM_BOT_TOKEN;
if (!token) throw new Error('RIM_BOT_TOKEN is required');
let offset = 0;
async function call(method, extra = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ method, ...extra })
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
  return data.result;
}
for (;;) {
  const updates = await call('getUpdates', { offset, limit: 50 });
  for (const update of updates) {
    offset = Math.max(offset, Number(update.update_id) + 1);
    const message = update.message;
    if (!message?.text) continue;
    const text = message.text.trim();
    const answer = text === '/start' ? 'Привет! Я бот РИМ.'
      : text === '/help' ? 'Напиши мне сообщение — я отвечу.'
      : `Получено: ${text}`;
    await call('sendMessage', { chat_id: message.chat_id, text: answer });
  }
  await new Promise(resolve => setTimeout(resolve, 900));
}
```

The example is a local/external bot worker. RIM hosts bot identities, chat delivery, update queue and API; it does not execute arbitrary user scripts inside the messenger process.
