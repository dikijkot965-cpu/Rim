# Iteration 159 — live Supabase validation record

## Environment

- Target: active RIM Supabase project (`xxvcsaomkyknudoaixbs`).
- Database: PostgreSQL 17.11.0.003.
- Edge Function: `rim-e2e-relay`, deployed version 1, status `ACTIVE`, JWT verification enabled.
- No new project or paid branch was created.

## Applied E2E migration set

| RIM migration | Supabase apply result |
|---|---|
| 136 — E2E scope foundation | Success |
| 142 — E2E relay tables and RPCs | Success |
| 143 — relay hardening | Success after correcting redundant REVOKE of dropped overload |
| 145 — scope readiness RPC | Success |
| 149 — device-bound ACK | Success |
| 153 — scheduled plaintext guard | Success |
| 154 — channel plaintext guard | Success |
| 158 — revocation tombstones | Success |

Migrations 137–141 were not part of the E2E backend dependency set and were intentionally not applied. The Supabase migration history records the successful E2E migrations.

## PostgreSQL test scenarios

All scenarios ran against the real PostgreSQL database with synthetic `auth.users` rows and service-role-only RPCs. Each scenario was wrapped in a transaction and rolled back. A subsequent query confirmed zero remaining synthetic test users.

- Two synthetic accounts registered primary device 1.
- Public identity records were provisioned.
- Three prekey types were uploaded for the recipient.
- The recipient prekey bundle was fetched; the KEM one-time prekey was consumed exactly once.
- Envelopes were sent A→B and B→A.
- Revocation changed the device row to `status='revoked'`, `enabled=false`, `registered=false`.
- Device-scoped prekeys and all queued envelopes sent by/to the revoked device were removed.
- Ordinary registration of the revoked primary slot was rejected with `device_slot_revoked_requires_secure_link`.
- Delivery ACK from a revoked device was rejected with `device_not_active`.
- The 31st prekey fetch in the 10-minute rate-limit bucket was rejected with `prekey_fetch_rate_limited`.

## Permission audit

The following relay RPCs are service-role-only: register device, remove device, provision identity, rotate identity, upload prekeys, fetch prekey bundle, send envelope and mark delivered. SQL privilege checks returned `anon=false`, `authenticated=false`, `service_role=true` for these functions. The scope-readiness RPC is granted to `authenticated`.

## Edge Function validation boundary

Supabase accepted the Deno Edge Function deployment and reported it `ACTIVE`. The deployed endpoint rejected an unauthenticated request at the Supabase gateway with HTTP 401 (`UNAUTHORIZED_NO_AUTH_HEADER`). This proves the deployment exists and JWT enforcement is on. It does **not** prove an authenticated request can complete each action. A valid-JWT two-account test remains outstanding and should be performed through the app's normal login flow; never paste passwords or bearer tokens into chat.

## Unchanged activation state

`protocolReady=false` remains in the application. No E2E scope was switched to `required`, no user device was enrolled, and no production message content was changed.
