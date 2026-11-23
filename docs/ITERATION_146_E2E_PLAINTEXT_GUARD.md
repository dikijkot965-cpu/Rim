# Iteration 146 — E2E plaintext boundary

## Why this change exists
The SDK relay and local encrypted message cache existed, but the ordinary `MessageCommandService.sendText()` path still inserted text into `chat_messages.body` without consulting `conversations.e2e_mode`. If a scope were ever marked `required`, this would be a plaintext downgrade path.

## New send-path behavior
For direct conversations, `MessageCommandService` asks `E2EScopeRepository` for the current scope mode before the legacy insert.

- `off`: ordinary RIM text send remains unchanged.
- `pending`: ordinary RIM text send remains unchanged and is not represented as protected E2E.
- `required`: send fails closed with the readiness reason; no `chat_messages` insert occurs.
- Scope lookup error: send fails closed; unknown state is not assumed to be `off`.
- E2E migration not installed: only the exact missing `e2e_mode` column/schema-cache errors (`42703`/`PGRST204`) are treated as legacy schema, because such a schema cannot have an E2E-required mode.

The same guard applies to outbox retries, using the conversation type captured with the queued item. A queued plaintext message cannot be retried into a now-required E2E conversation.

## Scope lookup optimization
For `off` and `pending`, no membership roster or relay-device readiness RPC is queried. Those are only needed when a trusted backend has set `e2e_mode = required`. For `required`, the existing membership check and Iteration 145 member-scoped readiness RPC still run.

## Global API reduction
The raw runtime, local store and direct send closure are no longer attached to `window`. They remain owned by the private composition container. This prevents ad-hoc page scripts from bypassing future E2E scope policy.

## What this does not do
- Does not set `protocolReady=true`.
- Does not activate E2E scopes or modify database rows.
- Does not yet route actual composer sends through the SDK.
- Does not merge local decrypted E2E history into the normal message timeline.
- Does not validate live Supabase or PostgreSQL behavior.

## Tests added
- required scope blocks plaintext insert while protocol is not ready;
- scope lookup errors block plaintext fallback;
- off scope preserves legacy send;
- outbox retry cannot leak plaintext into required scope;
- off/pending scopes skip relay readiness RPC;
- exact missing-column legacy schema handling;
- raw E2E runtime/store globals are absent.
