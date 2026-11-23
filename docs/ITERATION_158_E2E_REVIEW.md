# RIM E2E engineering review — Iteration 158

Date: 2026-11-22  
Baseline: Iteration 157  
Version: `4.1.8-iteration.158`

## Engineering direction
Iteration 158 prioritizes server security and a runtime-level integration proof over more local lifecycle micro-fixes.

## Substantive changes

1. **Device revocation tombstones.** The previous remove-device RPC deleted the device row. The new migration marks the device revoked, disables it, clears its registration state, records `revoked_at`, and removes device-scoped prekeys and queued envelopes. Registration rejects a revoked slot instead of reactivating it. This is important because local browser state may survive server-side revocation.
2. **Safer device registration retry.** A still-active, unregistered primary slot remains retryable after interrupted first-time provisioning. An already registered primary remains protected. A revoked slot is never treated as an empty slot.
3. **Bounded request-body memory.** The relay Edge Function no longer reads the complete request with `req.text()` before checking the limit. It checks Content-Length and enforces the 512 KiB limit while streaming.
4. **Runtime integration proof.** The new two-account test instantiates the actual RIM runtime twice, uses the actual Signal SDK 14.7.0 with PQ/Braid required, sends through the actual RIM relay adapter interface, decrypts on the recipient runtime, and checks local conversation records.

## What this proves

- SDK-to-RIM-runtime integration can complete a direct-message send/decrypt flow with the mock relay backend.
- The application payload `rim.chat.text.v1` survives encryption/decryption and reaches the local timeline store on both sides.
- Outgoing and incoming direction metadata is persisted separately.
- Device revocation semantics are represented in a forward migration and statically regression-tested.
- Oversized Edge Function request bodies are rejected before unbounded buffering.

## What this does not prove

- The new SQL migration has not been executed by PostgreSQL.
- The Edge Function passed TypeScript compiler checking with temporary ambient declarations for Deno/Supabase URL imports, but has not been typechecked by the actual Deno runtime or deployed to staging.
- The relay test backend is still a mock. It does not prove Supabase Auth, Postgres RPCs, RLS, Realtime delivery, mailbox retention, or production network behavior.
- Runtime integration test uses the SDK in-memory protocol store and a test local-message store. It does not prove OPFS SQLite or IndexedDB persistence, crash recovery, or protected storage.
- The real app's authenticated lifecycle still does not automatically start incoming delivery. No automatic device enrollment was introduced because it would register E2E devices without an explicit user opt-in or a validated staging environment.
- The real RIM UI send/read flow remains gated by `protocolReady=false`.

## Security decisions

- Do not restore a revoked device slot through ordinary registration.
- Do not delete the account-level Signal identity when revoking one device; other linked devices may still rely on it.
- Do not enable `protocolReady` based on mock tests.
- Do not deploy migration 158 to production without first applying the full ordered migration chain to disposable PostgreSQL and reviewing the resulting state.

## Next high-value work

1. Execute the ordered migrations through 158 on disposable PostgreSQL, with assertions for registration, revoke, attempted re-registration, prekey cleanup and envelope cleanup.
2. Deno typecheck and exercise all Edge Function actions with authenticated, wrong-owner, revoked-device, malformed-body and oversized-body requests.
3. Deploy to isolated Supabase staging and run two distinct authenticated accounts with separate browser profiles and real Realtime.
4. Validate offline mailbox recovery, acknowledgement, duplicate delivery and device revocation on that real backend.
5. Complete a consent-based E2E enrollment/session lifecycle and integrate the encrypted path into the actual direct-chat composer and timeline.
6. Test browser OPFS, IndexedDB fallback, Android WebView/PWA, restart and key persistence.

## Environment limitations

No `psql`, Supabase CLI, or Deno executable was available. No staging credentials were present. Production Supabase, GitHub, and Cloudflare were not modified.
