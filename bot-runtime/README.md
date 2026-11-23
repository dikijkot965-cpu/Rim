# RIM Bot Runtime (isolated-vm)

This service is the separate execution plane for user-authored bot JavaScript. It is intentionally not embedded in the browser app, Supabase Edge Functions, or the main RIM Worker.

## What it does

- Polls `rim_bots`, `rim_bot_runtime_state`, `rim_bot_projects`, `rim_bot_project_files`, and `rim_bot_updates` using a server-side Supabase service key.
- Runs each bot's `entry_file` in a persistent `isolated-vm` isolate.
- Exposes only the `RIM` facade to untrusted code: `RIM.onMessage(handler)`, `RIM.sendMessage(chatId,text)`, `RIM.setMyCommands(commands)`, and `RIM.log(...values)`.
- Does not expose Node.js globals, `require`, `process`, environment variables, the Supabase key, unrestricted `fetch`, or filesystem access to bot code.
- Enforces per-isolate memory and synchronous execution time limits. The Docker container is read-only, non-root, drops Linux capabilities, and has an overall memory/CPU/PID budget.

## Deployment

A persistent execution process is required. Supabase Edge Functions and Cloudflare Pages do not provide a safe general-purpose `eval` sandbox for arbitrary customer JavaScript. This runtime therefore needs a server/container host. No hosting provider has been purchased or provisioned by this change.

1. Install Docker Engine + Docker Compose on a server you control.
2. Copy this `bot-runtime/` directory to that server.
3. `cp .env.example .env` and fill in `SUPABASE_URL` and the project's **service_role** key. The service key must remain on this server and must never be placed in the browser, bot source code, GitHub, or a public file.
4. Generate a long random `RIM_RUNTIME_SHARED_SECRET` (for example, 32 random bytes encoded as hex). It is used only for the runtime admin endpoint.
5. Run `docker compose up -d --build`.
6. Check `GET /health` from a trusted network. Do not expose the admin endpoint publicly without a reverse proxy and access controls.
7. In RIM, open Tools → Bots, open a bot project, save `index.js`, then press Run. The desired state is written through `rim_bot_request_runtime`; the runtime should report `actual_state=running` and update `heartbeat_at`.

## Bot source contract

```js
RIM.onMessage(async update => {
  const message = update.message;
  if (!message) return;
  if (message.text === '/start') {
    await RIM.sendMessage(message.chat_id, 'Привет из РИМ!');
  }
});
```

`sendMessage` is limited to 30 sends per minute per bot and only succeeds if the bot account is a member of the target conversation. `setMyCommands` stores the bot command list. Bot source cannot import npm packages or call arbitrary network destinations in this first runtime version; this is deliberate least privilege, not an accidental limitation.

## Operational limits

- One runtime instance currently claims up to 8 active bots. Horizontal multi-instance leases are not implemented yet.
- If the process crashes after handling an update but before marking it consumed, the update may be delivered again (at-least-once). A handler error is logged and that update is marked consumed rather than retried. Handler side effects should be idempotent.
- Persistent JavaScript heap state survives between updates while the runtime process remains alive; it is lost on restart. Bots should store durable state in their own future bot storage API, not rely on in-memory variables.
- This is a first operational runner, not a complete Telegram-compatible bot platform. Webhooks, inline keyboards, callback queries, file APIs, bot web apps, package dependencies, secret vault, per-bot database, and billing/quotas remain future work.
- Review and test the container on a dedicated host before exposing it to public users. `isolated-vm` is a security boundary component, but no sandbox should be treated as immune to native runtime vulnerabilities.
