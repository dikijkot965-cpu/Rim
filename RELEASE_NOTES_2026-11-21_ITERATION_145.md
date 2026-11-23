# RIM 4.1.8 — Iteration 145

## Main focus: E2E relay integration verification and scope readiness repair

### Changes
- Added `rim_e2e_get_scope_device_readiness(text, uuid)`, a membership-checked `SECURITY DEFINER` RPC that returns only the minimum active registered device status and protocol profile needed by E2E readiness checks.
- Updated `E2EScopeRepository` to use the RPC instead of directly selecting `rim_e2e_relay_devices`. The direct SELECT grant on that table remains revoked.
- Found and fixed a permission mismatch: Iteration 142 revokes direct client access to the relay device registry, while the old scope repository still queried it directly. That path would fail under the real database grants.
- Added bounded envelope deduplication to the Supabase relay adapter so a mailbox-recovery pull racing a Realtime INSERT does not hand the same envelope to the SDK twice. Failed deliveries are not marked complete and can be retried; added regression coverage for retry after a failed callback.
- Added a separate two-account OpenE2EE SDK round-trip harness using the actual `SupabaseSignalProtocolRelay` adapter contract and a deterministic mock Edge Function/Realtime backend. Run it with `npm run test:e2e:relay`.

### Validation
- Node suite: 546/546 pass. Separate SDK/relay-adapter round-trip harness: 1/1 pass.
- `npm run check`: PASS, 119 mapped source modules and 24 legacy scripts.
- `npm run check:syntax`: PASS, 322 JavaScript files.
- `npm run build:cloudflare`: PASS, SDK bundle built; 162 Worker assets and 163 Pages files.
- `npm run audit:html`: 93 sites (14 REVIEW, 24 OK, 55 STATIC).
- Playwright E2E: skipped because `@playwright/test` is not installed.
- The separate two-account harness validates the SDK plus RIM adapter contract against a mock backend. It is not a live Supabase/Edge Function/SQL runtime test.
- PostgreSQL migration execution, deployed Edge Function, real Supabase accounts, physical Android and Playwright browser tests remain unverified.
- No production Supabase, GitHub, or Cloudflare deployment was changed.

### Remaining blockers
1. Apply migrations 136, 142, 143 and 145 to an isolated PostgreSQL/Supabase project in order; validate RLS, RPC signatures, race behavior and Realtime.
2. Deploy the Edge Function to staging and run the two-account exchange through the actual service.
3. Integrate encrypted messages into the RIM composer and timeline; no E2E scope may fall back to plaintext.
4. Complete authenticated secondary-device pairing and encrypted identity transfer.
5. Complete offline recovery, device revocation, and later group E2E.
6. Keep `protocolReady=false` until real application-path tests pass.
