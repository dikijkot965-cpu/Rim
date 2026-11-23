# RIM 4.1.8 — Iteration 142

## Main focus: E2E relay integration

- Added an application-owned Supabase relay adapter for OpenE2EE Signal Protocol SDK 14.7.0.
- Added an authenticated `rim-e2e-relay` Edge Function.
- Added device allocation/removal, account composite identity provisioning and compare-and-swap rotation.
- Added EC and ML-KEM public prekey publication, inventory, and atomic one-time prekey consumption; prekey publication is serialized and retry uploads are idempotent.
- Added ciphertext-only mailbox delivery, idempotent send handling, recipient/device validation, Realtime delivery, paginated recovery pull, mailbox cleanup, and delivery acknowledgements.
- Wired the relay into the lazy browser Signal runtime and added safe primary-device bootstrap (no silent replacement of an existing primary).
- Namespaced local Signal databases by a one-way account-ID hash to prevent cross-account local session/key reuse.
- Added an AES-256-GCM encrypted device-local content cache and a `rim:e2e-message` event for decrypted/outgoing text.
- Added relay contract, authorization boundary, binary serialization, mailbox recovery, and fail-closed regression tests.
- Added a real SDK two-account post-quantum encrypt/decrypt round-trip test over a test-only in-memory relay.

## Zlydya

No speculative feature batch was added. Next additions should be selected from verified Iris command documentation and mapped to existing RIM modules before implementation.

## Verification and release limitations

- `protocolReady` remains false.
- The RIM chat composer/message repository is not yet connected to the SDK/local cache event seam. The two-account protocol test uses a test-only in-memory relay, not Supabase.
- PostgreSQL migration execution, live Supabase Edge Function deployment, real two-account exchange, Android OPFS, and production tests remain outstanding.
- No production Supabase or Cloudflare changes were made.
