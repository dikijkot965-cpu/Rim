# RIM 4.1.2 — Iteration 129

## Highlights

- Supabase Vault now holds a separately generated recovery pepper. New recovery credentials use version 3 HMAC digests; version 1 hashes remain compatible. The pepper itself is never returned to the Edge Function.
- Added server-side seed-only authentication foundations: Custom Access Token Hook, per-session allow-list, restrictive RLS gate, two-phase activation RPCs and readiness guard. The mode remains unavailable until the Auth Hook is enabled and the two-phase Edge Function source is deployed.
- Fixed message UPDATE and DELETE policies to require both message ownership and current conversation membership.
- Added 54 missing foreign-key indexes, removed 5 redundant indexes and 14 exact duplicate RLS policies; rewrote 136 direct `auth.uid()` calls in policies to statement-cached subqueries. Unindexed-FK and auth-initplan advisor findings are now 0.
- Channel feed gained stable cursor pagination, pinned posts and a server-authorized pin/unpin RPC.
- Radio catalogue gained Radio Zvezda, Radio Vanya, Radio Mir, Monte Carlo, Monte Carlo Gold and DFM Disco 90s; added station favourites, sleep timer and bounded automatic reconnect.
- Added optional local app PIN (8–16 digits) or graphical pattern (6+ distinct nodes). This is a local screen privacy barrier, not account authentication.

## Production status

- `rim-account-security`: ACTIVE version 10. The project ZIP contains the newer two-phase source, but that source is not deployed yet.
- Supabase Vault pepper exists; new HMAC function is service-role-only.
- `rim_seed_only_readiness()` is `false`; strict seed-only sign-in is intentionally fail-closed.
- All 88 public tables have RLS enabled; 0 public tables are missing RLS.
- No anonymous-executable public `SECURITY DEFINER` functions remain. 50 authenticated-executable functions remain; all 50 statically reference `auth.uid()`. Supabase still warns about these functions and the private security-config table without client policies (intentional).
- Supabase organization plan is Free. Built-in leaked-password protection requires Pro or higher and remains disabled.

## Verification

- `npm test`: 424/424 PASS.
- `npm run check`: PASS, 108 mapped modules.
- `npm run check:syntax`: PASS, 284 JS files.
- `npm run audit:html`: 74 `innerHTML` sites; 7 require manual review.
- Playwright E2E, two-account auth, physical Android and load tests remain pending. Playwright installation timed out; no staging branch was created.
- Supabase staging branch quote: $0.01344/hour; creation requires explicit approval.
- Cloudflare build/deploy and GitHub push have not been run for this iteration.

---

# RIM 4.1.1 — Iteration 128

## Highlights

- Seed phrase creation is now a draft-and-confirm flow: the user must correctly re-enter three randomly selected words before the phrase is activated.
- Added full user-facing explanation of the 24-word phrase: purpose, recovery behavior, secure storage, loss, rotation, and limits of protection.
- Users who skip the first-run prompt can create or replace the phrase later in Settings → Privacy → Account security.
- Corrected onboarding classification: password presence is now checked against `auth.users.encrypted_password` through a service-role-only RPC, rather than assuming every email identity has a password.
- Recovery Edge Function deployed as active version 7. It rejects oversized requests, limits phrase length, and uses only Cloudflare's trusted `CF-Connecting-IP` for IP-based redemption limits; if unavailable, recovery fails closed.
- Legacy recovery-code HMAC v1 derivation remains compatible; phrase HMAC uses the separated v2 context.
- Radio catalogue expanded with Russian stations: Детское радио, Дорожное радио, Маруся FM, Радио Маяк, Радио России, Вести FM, Русское Радио, Наше Радио and Европа Плюс, plus the existing international stations. Added search and category filters.
- Channel directory now has category chips in addition to search and subscription scope.
- Supabase grants hardened: anonymous/public EXECUTE removed from mutating RPCs and trigger functions; anonymous EXECUTE removed from authenticated-only RLS helpers.
- Added a design note specifying the server-side requirements for a future strict “seed phrase only” login mode. The setting is deliberately not exposed until the authentication hook, session revocation, and RLS/Storage/Realtime gates can be tested end-to-end.

## Supabase production changes

- `rim-account-security`: ACTIVE, version 7.
- `20261120191000_rim_iteration_128_privileged_rpc_grants`: APPLIED.
- `20261120193000_rim_account_password_status_rpc`: APPLIED.
- `20261120194500_rim_iteration_128_rls_helper_grants`: APPLIED.
- All 88 public tables have RLS enabled.
- Security advisor: 0 anonymous-executable `SECURITY DEFINER` functions after grant hardening; 50 authenticated-executable functions remain, each statically confirmed to contain an `auth.uid()` check. The advisor still reports generic authenticated `SECURITY DEFINER` warnings, 10 RLS-enabled private tables without client policies (intentional service-only tables), and leaked-password protection disabled.

## Verification

- `npm run check`: PASS (107 mapped source modules).
- `npm run check:syntax`: PASS (281 JavaScript files).
- `npm test`: PASS (407/407).
- `npm run build:cloudflare`: PASS — 146 Worker assets and 147 Pages-only files.
- Playwright E2E: NOT RUN — dependency is absent; package installation timed out in this environment.
- Two-account auth/recovery tests: NOT RUN — no disposable test identities were provisioned.
- Android device tests: NOT RUN — no physical Android device session is available.
- Load test: NOT RUN against production to avoid creating unapproved traffic; requires an isolated staging environment and agreed load profile.

## Important security limitations

- The current RIM v1 phrase contains 184 bits of random entropy (23 random bytes) plus one checksum byte. It is high-entropy, but it is not a 256-bit BIP-39 phrase.
- The dedicated `RIM_RECOVERY_PEPPER` is not configured in the project secrets. The Edge Function retains a compatibility fallback to the service-role key; set a dedicated stable secret before rotating the service-role key.
- Strict seed-only login is not shipped yet. Hiding password/email controls would not secure direct Supabase Auth calls; the complete server-side gate is documented in `docs/SEED_ONLY_AUTH_DESIGN.md`.
- Radio stream endpoints are third-party streams and may change or be geo-restricted. Browser playback and Android playback still need real-device validation.


## RIM 4.1.3 — Iteration 130
- Completed server-side two-phase seed-only activation rollout and deployed `rim-account-security` v12.
- Added 12-word custom RIM recovery phrases (128-bit entropy) alongside the existing 24-word format (184-bit entropy).
- Added a server-side rate-limit bucket for repeated seed phrase guesses.
- Added admin resource gauges for database size, Storage size, bucket object counts and public table count.
- Added Web Push service worker, per-device subscription lifecycle and generic push delivery for new direct/group messages. VAPID secrets remain to be configured by the owner.
- Improved channel pinned-post navigation.
