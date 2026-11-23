# RIM Iteration 160 — live E2E relay authorization

Date: 2026-11-22  
Version: `4.1.8-iteration.160`

## Security changes deployed to active Supabase

- Added database triggers on `rim_e2e_relay_prekey_fetch_limits` and `rim_e2e_relay_envelopes`. Both require the requester/sender and target to share an eligible RIM scope: a direct conversation, a private group, or a private channel. Unauthorized prekey probing is rejected before prekeys can be consumed; unrelated mailbox routes are rejected before ciphertext insertion.
- Added `rim_e2e_users_share_scope(uuid,uuid)`, executable by `service_role` only. The Edge Function uses it before returning another user's active device metadata or public identity key.
- Deployed `rim-e2e-relay` version 2 with `verify_jwt=true`. Error mapping now returns 403 for shared-scope denials and owner mismatch.
- No user device was enrolled and no conversation E2E mode was changed by deployment.

## Opt-in authenticated test surface

- Added `?rim-e2e-lab=1` diagnostics panel. It uses the currently signed-in RIM session; it does not ask for passwords or bearer tokens.
- Read-only device inspection is separate from the explicit start action. Starting the SDK can register primary device 1 and publish public prekeys; the panel asks for confirmation first.
- The send test requires an existing direct conversation containing exactly the signed-in user and the entered peer. It sends a synthetic encrypted test payload through the actual SDK and Relay, and displays decrypted incoming test messages.
- Closing/stopping the lab closes the local SDK session but does not revoke the registered device or delete server keys.

## Activation boundary

`protocolReady=false` remains. The lab is a controlled engineering test, not a production E2E rollout. No E2E-required scopes, plaintext fallback, or automatic device enrollment were enabled.

## Iteration 162 follow-up

- Revoked `anon` and `authenticated` EXECUTE on the unused legacy `rim_e2e_claim_prekey_bundle(uuid,uuid)` RPC; `service_role` only remains. The active Signal SDK transport uses `rim-e2e-relay`, so this closes an obsolete authenticated prekey-consumption path without changing the active transport. Live privilege check passed.
