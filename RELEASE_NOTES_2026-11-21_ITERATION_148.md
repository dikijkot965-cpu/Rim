# RIM 4.1.8 — Iteration 148

## E2E plaintext boundary hardening

- Preserved `conversationIsPrivate` in new outbox records so group retries re-check the same privacy state; legacy queue records missing this field fail closed rather than assuming a group is public.
- Fixed an offline-queue leak: the existing outbox v2 stores message bodies in localStorage, so the composer now checks the current conversation's E2E scope before queueing a failed send. Required scopes are not queued in plaintext; scope lookup errors and unknown private-group status fail closed.
- Extended `MessageCommandService` scope checks to private groups as well as direct chats. Required group text sends are blocked until a reviewed group transport exists; sticker and image paths are also blocked before insert/upload.
- Added explicit account identity checks around text-send preflight and the SDK send acceptance boundary. An accepted E2E message is never written to the newly active account's local content database after an account switch.
- Bound local encrypted-content store reads/writes to the account ID captured by the SDK operation. Incoming decrypt callbacks carry their owning account ID; reads and writes abort if authentication changes during encryption, key access, local-history decryption or persistence.
- Added a scope check before forwarding to a target conversation. E2E-required targets are rejected before any attachment copy or message insert.
- Added a scope check before voice-message upload. Voice messages in E2E-required scopes are rejected before Storage upload; scope lookup failures are fail-closed. The voice send lock now covers asynchronous scope verification to prevent parallel recordings/sends.
- Added tests for all of the above, including private-group text/sticker/image paths, offline queue refusal, forward target guard, voice upload guard, voice send-lock race, and account-switch local-cache isolation.

## Validation

- Project check: PASS (120 mapped source modules; 24 legacy scripts).
- Syntax: PASS (324 JavaScript files).
- Node suite: PASS (578/578; serialized test workers).
- SDK/RIM relay adapter PQ+Braid round-trip: PASS (1/1; mock backend only).
- HTML audit: 93 sites (14 REVIEW, 24 OK, 55 STATIC).
- Cloudflare build: PASS (163 Worker assets; 164 Pages files).
- Production Supabase read-only recheck: ACTIVE_HEALTHY, PostgreSQL 17.11; migration history still ends at Iteration 135; deployed Edge Function list still has no `rim-e2e-relay`. No production writes were made.

## Not completed / safety gates

- `protocolReady` remains false. E2E is not activated.
- SQL migrations 136/142/143/145 still need isolated PostgreSQL/Supabase runtime validation.
- No live two-account Supabase Realtime/mailbox recovery test. The PQ/Braid test uses a mock backend.
- E2E group messaging, attachments, receipts, push metadata, complete reply/edit/delete lifecycle, linked-device pairing/transfer/recovery and Android/OPFS validation remain outstanding.
- No production Supabase migration, Edge Function deployment, GitHub push or Cloudflare deployment performed.
