# E2E Iteration 143 — relay hardening

## Why these changes were made

The previous relay allowed any authenticated account session to request a peer prekey bundle without proving that the requester had a registered E2E device. It also had no per-account/target limiter for one-time-prekey consumption. In addition, a fetch could consume an EC one-time key before discovering that no KEM key was available, returning no usable PQ bundle while wasting the EC key.

## New request binding

`SupabaseSignalProtocolRelay.fetchPreKeyBundle()` now sends `requesterDeviceId` from the local relay instance. The Edge Function forwards this as `p_requester_device_id`. PostgreSQL verifies that the requesting account owns an active, enabled, registered device.

## Rate limit

`rim_e2e_relay_prekey_fetch_limits` stores only account IDs, target device ID, time bucket, and attempt count. It does not store message text, private keys, or ciphertext. A requester can fetch up to 30 bundles for the same target device in a 10-minute bucket. The RPC is service-role-only and the table has RLS enabled with all client grants revoked.

## Prekey consumption order

1. Verify requester device and block relationship.
2. Apply rate limit.
3. Resolve target device, account identity, and EC signed prekey.
4. Reserve a KEM one-time key or a valid last-resort KEM key.
5. Only after a KEM-capable bundle is available, reserve and consume the optional EC one-time key.
6. Mark the consumed one-time KEM key and return the bundle.

This preserves the intended PQ-required session establishment behavior.

## Device enrollment safety

Only initial primary-device registration is accepted. Existing registered primary devices cannot be overwritten. Secondary device registration is rejected with `secondary_device_requires_link_approval` until the QR/pairing approval and encrypted identity-transfer path is implemented. This is deliberately stricter than the eventual multi-device feature.

## Sender multi-device sync

The envelope send RPC returns `needsSync` when the sender has another active registered device. The SDK uses this flag to trigger self-sync behavior. `deviceSetChecked` continues to indicate that the target device set was compared against the declared set.

## Deployment status

Not deployed. The user's connected production Supabase project was inspected read-only: its applied migration history currently ends at `20261121094616`, and it has the earlier `rim_e2e_devices` tables but not the new `rim_e2e_relay_*` tables or `rim-e2e-relay` Edge Function. No schema or function was changed.

## Scope/device registry consistency

E2E scope readiness previously queried the older experimental `rim_e2e_devices` registry, while the Signal relay registers devices in `rim_e2e_relay_devices`. Iteration 143 adds an explicit `protocol_profile` to the relay registry and changes scope readiness to query that same table. This prevents a future readiness check from reporting every member as missing simply because two registries were used.
