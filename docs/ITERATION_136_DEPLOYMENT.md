# Iteration 136 — deployment checklist

This package contains local changes only. Nothing in this checklist has been run against the live Supabase project.

## 1. Review and apply database migrations

Apply these migrations in order, only after comparing their table/column assumptions with the live project:

Apply the Zladen migrations 136–141 in timestamp order:

1. `20261121121000_rim_iteration_136_zladen_system_bot.sql`
2. `20261121130000_rim_iteration_137_zladen_group_moderation.sql`
3. `20261121140000_rim_iteration_138_zladen_platform_modules.sql`
4. `20261121150000_rim_iteration_139_zladen_group_arrival.sql`
5. `20261121160000_rim_iteration_140_zladen_command_control.sql`
6. `20261121170000_rim_iteration_141_zladen_games_economy_triggers.sql`

Do not reapply `20261122052958_rim_iteration_136_e2e_scope_foundation`: that separate E2E migration is already applied in the live project.

The E2E migration is additive. Existing conversations and channels remain `e2e_mode='off'`; no message body is rewritten. Public channels are prevented from entering E2E mode. The enable RPC only marks a scope `pending` and the client currently refuses activation.

The Zladen migration creates the system-bot registry and install table, RPCs, a welcome message, and the initial slash-command responder. It assumes the existing RIM tables have the columns already used by the application: `conversations(type,created_by,title,is_private,last_message_at)`, `conversation_members(conversation_id,user_id)`, and `chat_messages(conversation_id,sender_id,body,client_message_id)`. Verify these before applying.

## 2. Deploy the Zladen Edge Function

Deploy `supabase/functions/rim-zladen/index.ts` as the function `rim-zladen`.

The function prefers the optional `RIM_OWNER_USER_ID` secret. If it is absent, it resolves the owner only when `app_user_roles` contains exactly one `superadmin`; missing or ambiguous ownership fails closed. No owner UUID is embedded in the repository or browser bundle.

The function also uses the standard `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secrets provided by the Supabase Edge Functions environment. Never expose the service-role key in browser code.

After deployment, the first authenticated app session provisions the dedicated bot identity through Supabase Auth Admin and creates the user's default direct chat. The bot username is `zladen_bot`.

## 3. Deploy the web client

Build the Cloudflare output using the existing RIM build process and deploy the generated Pages output. Do not replace the existing Supabase project or backend configuration.

## 4. Verify Zladen

Use two ordinary test accounts:

- Confirm a new account gets one direct chat with Злыдя and a welcome message.
- Test `/start`, `/help`, `/commands`, `/ping`, and `/id` in the direct chat.
- Add `zladen_bot` to a private test group and test `/help` and `/id` there.
- As the owner, open Tools → Настроить Злыдю and change the display name, username, and avatar.
- Test block/unsubscribe and re-enable flows before announcing them as user-facing controls. The lifecycle API exists, but dedicated in-chat buttons are not part of this iteration.

## 5. E2E status — do not announce as enabled

The production protocol SDK is not installed. The encrypted message send/read path, key verification UI, attachment encryption, and multi-device ratchet persistence are not integrated. `protocolReady` is deliberately false. The database schema is only a foundation; E2E is not active.

Do not manually set `e2e_mode='required'` until the protocol integration and two-account/two-device tests have passed. The database triggers reject plaintext writes after trusted activation, but the current client cannot yet create or read encrypted messages.
