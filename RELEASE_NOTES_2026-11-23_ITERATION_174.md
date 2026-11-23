# RIM 4.1.8 — Iteration 174

Date: 2026-11-23

## E2E fixes and testing
- Fixed unique SDK timestamps for each pairwise send in group/private-channel fan-out. This addresses a real failure where the SDK rejected subsequent recipients as duplicate sends from the same device.
- Added real Signal SDK three-account encrypted round-trip tests for private group fan-out and private-channel fan-out.
- Expanded E2E Live Lab to support secret direct chats, private groups and closed channels, with membership validation and encrypted challenge/ACK before sending. The lab only operates on scopes already marked `e2e_mode='required'`; it never activates E2E or changes ordinary conversations.
- Added UI wiring tests for the lab.

## Production checks
- Read-only Supabase inspection confirms the project is ACTIVE_HEALTHY, required E2E RPCs and scope columns exist, diagnostics tables exist, and `rim-e2e-relay` is ACTIVE v2 with JWT verification.
- No production database migration or Edge Function was changed in this iteration.

## Important boundary
In-memory SDK tests are not proof of live Supabase user-to-user exchange. Production two-account/device testing and restart recovery remain required.
