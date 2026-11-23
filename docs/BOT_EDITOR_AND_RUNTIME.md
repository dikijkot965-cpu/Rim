# RIM bot workspace — current status

This file is retained for continuity. The authoritative iteration 135 design is in `docs/BOT_RUNTIME_AND_EDITOR.md` and the deployment instructions are in `bot-runtime/README.md`.

## Implemented in iteration 135

- Bot management remains outside the primary navigation under **Инструменты → Боты**.
- Bot source files persist in Supabase `rim_bot_projects` / `rim_bot_project_files` and no longer have the former hard-coded 1 MB rejection.
- The editor supports multi-file import, file listing/switching, creating a file, autosave, explicit save, snapshots and runtime start/stop requests.
- Source versions and owner-visible runtime state/logs have dedicated tables and RLS.
- `rim_bot_request_runtime` is an authenticated owner-checked RPC.
- A separate Node 22 + `isolated-vm` runtime package is prepared in `bot-runtime/`.

## Not yet live

- The runtime container has not been deployed. A persistent server/container host is still required; a Run request only records desired state until that service is online.
- The current runner supports a single JavaScript entry file, no npm packages/import graph, no TypeScript compilation, no arbitrary fetch/network, no webhook, no inline keyboards/callbacks, no file API, no Mini Apps, no per-bot durable KV, and one instance with a maximum of 8 bots.
- The editor is a functional source workspace, not yet a full IDE with CodeMirror/Monaco, language server, debugger, terminal or dependency manager.
- The `Царь-бот` / `@Imperator_bot` system chat and chat-driven BotFather-style creation flow are not implemented.

## Security boundary

Never run user JavaScript inside the RIM page or a Supabase Edge Function using `eval`/`Function`. The runtime must keep the Supabase service-role key outside the isolate and expose only a narrow bot API. The included container is hardened but still requires deployment review and independent sandbox testing before public exposure.
