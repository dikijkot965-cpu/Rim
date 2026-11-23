# RIM 4.1.8 — Iteration 143

## Main focus: E2E relay hardening

### Changes
- Prekey bundle requests are now bound to the authenticated requester's registered device ID.
- The relay rejects prekey requests from accounts without an active, registered, enabled E2E device.
- Prekey fetches are rate-limited per requester account / target device to 30 requests per rolling 10-minute bucket.
- The prekey fetch transaction checks for a usable post-quantum KEM key before consuming an optional EC one-time prekey. This prevents losing an EC prekey when no PQ-capable bundle can be returned.
- The relay now returns the SDK's `needsSync` signal when the sender has another active registered device.
- Initial registration is restricted to the primary device slot. A registered primary device cannot be silently overwritten, and secondary devices are rejected until a secure pairing and encrypted identity-transfer flow exists.
- Scope readiness now reads the same `rim_e2e_relay_devices` registry used by the Signal relay and checks its explicit protocol profile.
- Added adapter and migration contract tests.

### Security rationale
The relay's service-role database operations are still reached only through the authenticated Edge Function. This migration does not change production data until explicitly applied. The browser must not be able to claim a secondary device or overwrite an existing primary identity merely by making an authenticated registration call.

### Verification
- Node test suite: 543 tests after full run.
- JavaScript syntax, project structure and Cloudflare build are checked in this iteration.
- PostgreSQL runtime validation is not yet available in this workspace.
- No Supabase migration or Edge Function was deployed.
- E2E remains fail-closed; production protocol readiness is false.

### Remaining blockers
- Apply migrations 136–143 to an isolated Supabase development database and validate SQL behavior.
- Deploy the Edge Function to a development environment and verify authenticated requests.
- Run a real two-account exchange through Supabase Realtime + mailbox recovery.
- Wire the SDK's decrypted and outgoing messages into the RIM chat timeline and encrypted scope message repository.
- Implement approved secondary-device linking and encrypted key transfer.
- Complete group E2E / sender-key support and recovery UX.
