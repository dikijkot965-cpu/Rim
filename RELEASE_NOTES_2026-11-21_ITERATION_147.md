# RIM 4.1.8 — Iteration 147

## E2E timeline and send-path integration

- Added `e2e-timeline-adapter.js` to map decrypted device-local records into the existing RIM message renderer shape.
- Direct-chat timeline now merges local E2E history with server-backed history, sorts by message timestamp, deduplicates by ID and refreshes after incoming/outgoing E2E message events.
- Older-page pagination now uses the oldest server-backed row only; a local E2E ID is never passed as a Supabase `chat_messages` cursor.
- Added a gated composer route through `RimSignalProtocolRuntime.sendDirect()` for required direct scopes. It only proceeds when readiness is true and the peer ID is resolved. Since `protocolReady` remains false, no current scope can activate this route yet.
- Outgoing SDK acceptance is distinguished from local-cache persistence failure to avoid treating an already accepted message as a retryable send failure.

## Plaintext and legacy-operation safety

- Required direct scopes block legacy sticker inserts and image uploads before any Supabase Storage or `chat_messages` write.
- Local-only E2E rows are tagged in the renderer; the old message action sheet is suppressed for these rows.
- Legacy edit, delete, react, forward and read-receipt display paths reject or suppress local-only E2E records rather than sending their IDs to server-side APIs or showing inaccurate receipts.

## SDK recovery handoff

- Added `docs/SDK_OFFLINE_BOOTSTRAP_NEXT_AI.md` with the existing GitHub Actions workflow names, exact artifact retrieval steps, pinned package versions and SHA-512 integrity value.
- The tested network-runner workaround remains the preferred route when local DNS returns `EAI_AGAIN` for `registry.npmjs.org`.

## Not completed / safety gates

- `protocolReady` remains false. E2E is not activated.
- SQL migrations 136/142/143/145 have not been validated on isolated PostgreSQL/Supabase and have not been applied to production.
- No live two-account Supabase Realtime/mailbox test; existing PQ/Braid round-trip uses a mock backend.
- Encrypted attachments, E2E receipts, E2E push semantics, complete reply/edit/delete lifecycle, linked-device pairing/transfer/recovery and Android/OPFS validation remain outstanding.
- No production Supabase, GitHub or Cloudflare deployment performed.
