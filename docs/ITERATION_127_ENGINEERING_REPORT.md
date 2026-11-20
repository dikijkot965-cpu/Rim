# RIM 4.1.0 — Iteration 127 Engineering Report

Date: 2026-11-20

## Scope

This iteration continues the existing modular runtime. It does not replace the messenger or remove legacy compatibility files.

## Implemented

- Added RIM-specific 24-word recovery phrase format: 23 random bytes (184 bits) plus a SHA-256 checksum byte mapped to a fixed 256-word list. This is deliberately not BIP-39 and is not a cryptocurrency wallet seed.
- Added server-side checksum validation, HMAC-only storage, one-time consumption, recovery-attempt throttling, and account-security status/onboarding endpoints to `rim-account-security`.
- Preserved the v1 HKDF derivation for existing recovery codes so previously issued codes remain verifiable.
- Added one-time account-security onboarding for new accounts created after the rollout timestamp. Users with an email/password identity are offered the recovery phrase only; users without a password identity can create a cloud password and/or a recovery phrase.
- Added owner-only admin metadata for identity providers, password-configured status, recovery phrase status, and recovery-code status. No password or recovery secret is returned to administrators.
- Added cloud music analytics columns and owner-scoped updates for play counts, completion counts, listened seconds, daily plays, favourites, file size, and last-played time.
- Expanded music analytics with seven-day activity, top tracks, top artists, completion rate, average listening time, library size, and totals.
- Added an embedded SomaFM internet-radio player with six HTTPS stations and local listening statistics.
- Refreshed the channel directory with signed avatars, search, clearer subscription state, category/date metadata, and responsive channel cards.
- Added `src/domain/recovery-phrase.js` and `src/features/radio-player.js` to the architecture map.

## Database changes

Migration `20261120184000_rim_security_music_admin_hardening` was applied to the connected Supabase project. It is additive and preserves existing account, recovery-code, and music rows. The new admin dashboard and user-list RPCs were executed successfully under a simulated superadmin claim.

New database objects include:
- `rim_account_security_state`
- `rim_recovery_rate_limits`
- `rim_rotate_recovery_phrase`
- `rim_consume_recovery_phrase`
- `rim_check_recovery_rate_limit`
- `rim_admin_dashboard_stats_v2`
- `rim_admin_list_users_v2`
- `rim_admin_search_users_v2`

## Security design notes

- Recovery phrase and recovery-code raw values are never stored in Postgres.
- Recovery secrets are not visible to administrators.
- Existing recovery-code hashes continue using their original v1 HKDF derivation.
- The new phrase is an RIM-only account recovery credential, not a BIP-39 phrase and not suitable for wallet import.
- The recovery Edge Function source still uses the existing server-only service-role key as the HMAC root if `RIM_RECOVERY_PEPPER` is not configured. A dedicated stable secret is recommended for production.
- Deployment of the updated Edge Function was blocked by the deployment tool in this session. The connected project still has the previous live Edge Function version. The recovery phrase and new onboarding will not work in production until `supabase/functions/rim-account-security/index.ts` is deployed. Existing recovery-code requests remain compatible because their v1 HMAC derivation was preserved.
- New private security tables have RLS enabled and no client policies; only the service role can access them.

## Verification status

- Node test suite: PASS, 403/403.
- JavaScript syntax checks: PASS, 280 files.
- Project architecture checks: PASS, 107 modules mapped, 24 legacy files.
- Cloudflare static build: PASS, 146 Worker assets and 147 Pages-only files.
- HTML sink audit: 71 innerHTML sites; 41 static, 24 classified OK, 6 require review.
- Browser E2E: skipped because Playwright is not installed; this is not a pass.
- Real-device audio playback, OAuth recovery, and concurrent-account behavior still require manual browser/device validation.

## Known limitations

- SomaFM radio stream metadata (live track title) is not yet integrated; station identity and listening-time statistics are shown.
- Radio listening statistics are stored locally in the browser profile, not synchronized across devices.
- Recovery phrase generation is a RIM-specific custom format. Do not describe it as BIP-39 or a wallet seed.
- The admin dashboard's existing analytics time-series RPC remains as before; v2 adds additional aggregate counters.
- Load testing at 1k/5k/10k active sessions has not been performed.
