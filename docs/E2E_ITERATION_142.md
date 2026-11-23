# RIM E2E — Iteration 142

## Scope

This iteration adds the RIM-owned transport boundary for OpenE2EE Signal Protocol SDK 14.7.0. The browser owns private protocol state in the SDK local store. Supabase stores only public identity/prekey material, ciphertext envelopes, and routing metadata.

## Components

- `src/security/e2e/supabase-signal-relay.js` implements the SDK 14 `SignalProtocolRelayServer` client contract.
- `src/security/e2e/local-message-store.js` encrypts app-level decrypted text with a non-extractable AES-256-GCM key before storing it in a device-local IndexedDB database.
- `supabase/functions/rim-e2e-relay/index.ts` authenticates the Supabase JWT and performs relay operations with the service role. The service-role key is never sent to the browser.
- `supabase/migrations/20261121180000_rim_iteration_142_e2e_relay.sql` adds device, identity, prekey, and ciphertext mailbox tables plus service-only RPCs.
- `src/app.js` injects the RIM relay and local message cache into the lazy Signal runtime. A successful send/decrypt emits the `rim:e2e-message` event; the local store can return a conversation history without uploading plaintext.
- `RimSignalProtocolRuntime` registers the primary device before SDK sync, refuses to overwrite an existing primary device when local identity material is absent, and hashes the account ID to derive a per-account local database name.

## Implemented relay operations

- Allocate/revoke device slots (up to five active devices per account).
- Provision a canonical composite identity and reject tuple mismatch unless an explicit compare-and-swap rotation is requested.
- Publish EC signed/one-time prekeys and ML-KEM one-time/last-resort prekeys.
- Atomically consume EC and ML-KEM one-time prekeys while returning the target identity and signed prekey bundle. Prekey publication is serialized per account/device (Web Locks where available, local mutex otherwise), database writes lock the device row, and retry uploads are idempotent.
- Read own prekey inventory and rotation metadata.
- Send opaque ciphertext envelopes with account/device ownership checks, block checks, recipient registration checks, device-set comparison, and idempotent retry IDs.
- Deliver envelopes through Supabase Realtime and recover pending messages with a paginated mailbox pull (up to 5,000 pending envelopes per recovery pass). Expired and old delivered mailbox rows are cleaned during recovery pulls.
- Mark received envelopes delivered.

## Security boundaries

- The Edge Function verifies the bearer JWT with `auth.getUser()` and derives the sender account from that verified user. A client-supplied sender ID is never treated as authentication.
- Private keys and decrypted message content are not accepted by the relay API.
- One-time prekeys are consumed under row locks with `SKIP LOCKED` inside a database transaction.
- Identity rotation uses a server-side compare-and-swap against the previously stored commitment and invalidates published prekeys for that identity namespace.
- Envelope payloads are opaque base64 ciphertext. Realtime access is restricted to rows whose `target_user_id` equals `auth.uid()`.
- Public-key material is visible to authenticated users as required for session establishment; private prekey inventory is restricted to the account owner through the Edge Function.

## Known gaps — do not mark E2E ready

1. The SDK send/decrypt path and local encrypted content cache now exist, but the RIM message repository and chat composer are not yet wired to them. The `rim:e2e-message` event is an integration seam, not a completed UI path.
2. The current transport covers pairwise relay operations; the SDK group-server capability is not implemented here.
3. The migration has not been executed against a PostgreSQL staging database in this environment. The Supabase CLI and `psql` are unavailable here.
4. No live Supabase Edge Function, migration, or Cloudflare deployment has been made.
5. The SDK's post-quantum two-account cryptographic round trip passes against a test-only in-memory relay. This does not validate the Supabase Edge Function or SQL implementation. No real two-account browser test, Android OPFS test, linked-device test, or load test has passed.
6. The SDK's published security documentation and audit status must be independently reviewed before a production security claim.

The local cache key is stored by the browser origin and is not an XSS defense. Clearing browser site data removes local history and the SDK key vault; encrypted backup/recovery UX is still required.

`protocolReady` intentionally remains `false`. This code is a substantial relay and protocol integration step, not a production E2E release.
