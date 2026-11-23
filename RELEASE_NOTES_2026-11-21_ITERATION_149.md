# RIM 4.1.8 — Iteration 149

## Supabase E2E mailbox acknowledgement hardening

- Static review of the relay SQL/Edge Function found that `mark_delivered` trusted a caller-supplied device ID without verifying that the device was still active, registered and enabled. Another active device on the same account could therefore acknowledge mailbox rows for a different device.
- Added migration `20261121210000_rim_iteration_149_e2e_relay_ack_device_guard.sql`: the service-only acknowledgement RPC locks and verifies the exact active/registered/enabled device and updates only the envelope addressed to that user+device pair. Unknown envelope/device pairs fail closed.
- The Edge Function mailbox `pull` now requires `enabled=true` in addition to active/registered status.
- Mailbox pagination cursor input is validated before cleanup/query operations: timestamps must parse, cursor IDs must be UUIDs, and the PostgREST OR filter is built only from normalized values. `mark_delivered` envelope IDs are also UUID-validated.
- Added a migration/Edge Function regression test and updated mailbox pagination fixtures to use real UUID-shaped IDs.

## Validation

- Project check: PASS (120 mapped source modules; 24 legacy scripts).
- Syntax: PASS (324 JavaScript files).
- Node suite: PASS (579/579; serialized test workers).
- SDK/RIM relay adapter PQ+Braid round-trip: PASS (1/1; mock backend only).
- HTML audit: 93 sites (14 REVIEW, 24 OK, 55 STATIC).
- Cloudflare build: PASS (163 Worker assets; 164 Pages files).
- Edge Function TypeScript syntax transpilation via esbuild: PASS; Deno-specific typecheck/deploy not run.
- Production Supabase read-only audit: ACTIVE_HEALTHY, PostgreSQL 17.11; migration history still ends at Iteration 135; deployed Edge Function list still has no `rim-e2e-relay`.

## Not completed / safety gates

- Migration 149 is authored but not applied or runtime-validated. Migrations 136/142/143/145/149 still require isolated PostgreSQL/Supabase validation.
- No live two-account Supabase Realtime/mailbox recovery test; the PQ/Braid round-trip uses a mock backend.
- `protocolReady=false`; E2E is not activated.
- No Deno deploy/typecheck, production migration, Edge Function deployment, GitHub push or Cloudflare deployment performed.
