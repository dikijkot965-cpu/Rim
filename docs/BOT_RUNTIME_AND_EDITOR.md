# RIM bot workspace and runtime

## What is now implemented

- Bot project metadata stored in `rim_bot_projects`.
- Multiple source files stored in `rim_bot_project_files` as text; there is no app-imposed 1 MB file-size check.
- Explicit source snapshots in `rim_bot_project_versions`.
- Runtime desired/actual state and owner-visible logs.
- RLS restricting source projects to their bot owner.
- `rim_bot_request_runtime(bot_id, desired_state)` validates ownership server-side and queues start/stop requests.
- Editor autosaves the active file to Supabase; uploaded files are saved to the project. The entry file defaults to `index.js`.
- A separate Node 22 + `isolated-vm` runtime service is included in `bot-runtime/`.

## Runtime status

The runtime service is prepared but **not deployed**. It requires a persistent container host. The user has not provisioned a server or provided an approved runtime host. A Run click only records `desired_state=running`; the bot is not actually executing until a runtime container connects and updates its heartbeat.

Do not claim arbitrary user code is running just because the source file is uploaded. The browser does not execute user code. The runtime intentionally does not expose Node globals, `require`, filesystem, process environment, or unrestricted network fetch to user scripts. It exposes the small `RIM` facade only.

## Current sandbox API

```js
RIM.onMessage(async update => {
  const message = update.message;
  if (!message) return;
  if (message.text === '/start') {
    await RIM.sendMessage(message.chat_id, 'Привет из РИМ!');
  }
});
```

- `RIM.onMessage(handler)` registers one update handler.
- `RIM.sendMessage(chatId, text)` sends only to a conversation the bot belongs to.
- `RIM.setMyCommands(commands)` persists bot commands.
- `RIM.log(...values)` writes runtime logs.

The first runtime version does not support npm packages, TypeScript compilation, webhooks, inline keyboards, callback queries, file APIs, Mini Apps, or per-bot persistent KV storage. It currently processes one runtime instance with up to 8 bots. State in JavaScript memory is lost when the container restarts.

## Deploying the runtime

See `bot-runtime/README.md`. The service role key must exist only in the container's environment. Never add it to the frontend, bot source, ZIP intended for public distribution, or GitHub.

## Large source files

The previous explicit 1 MB frontend rejection was removed. Files are stored in Postgres text rows. This does not mean physically infinite storage: browser memory, PostgREST request limits, database row limits, and project storage limits still apply. For large projects, move source bundles to object storage with a manifest and upload in chunks in a later iteration.
