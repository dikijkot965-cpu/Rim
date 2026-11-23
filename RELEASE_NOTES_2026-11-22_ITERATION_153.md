# RIM 4.1.8 — Iteration 153

## E2E safety: scheduled channel publications

- Private-channel schedule creation now checks E2E scope before writing plaintext to `channel_scheduled_posts`.
- Scheduled publication now performs the same preflight before calling `rim_channel_publish_scheduled`.
- Private-channel scope lookup errors and unknown channel privacy fail closed. Public channels retain the existing schedule/publish path.
- Scheduling checks account/feed identity after scope lookup and after the insert. If the account or channel changes after insertion, the controller attempts to cancel the just-created scheduled row.
- New migration `supabase/migrations/20261122090000_rim_iteration_153_e2e_channel_schedule_guard.sql` rejects plaintext schedule insert/update when a private channel is E2E-required. It also prevents switching a channel to `required` while plaintext scheduled posts remain queued.
- Encrypted scheduled posts are not implemented; the safe behavior is to block this feature for E2E-required channels.

## Validation

- `npm test`: 597/597 passed on final full-suite rerun. One earlier full-suite run had a transient failure in an unrelated recovery phrase test; the focused test and full-suite rerun both passed.
- `npm run check`: passed (120 mapped source modules; 24 legacy scripts).
- `npm run check:syntax`: passed (326 JavaScript files).
- `npm run audit:html`: completed (93 sites: 14 REVIEW, 24 OK, 55 STATIC).
- `npm run build:cloudflare`: passed (163 Worker assets, 164 Pages files).
- `npm run test:e2e:relay`: passed (1/1 SDK PQ/Braid round-trip through the RIM relay adapter contract using a mock backend).

## Limitations / not deployed

- SQL migration is statically inspected by tests but not executed against PostgreSQL; no `psql`, `postgres`, Docker, or Deno runtime is available in this environment.
- No production Supabase migration was applied, no Edge Function was deployed, and no GitHub/Cloudflare deployment was performed.
- `protocolReady=false`; E2E remains disabled for users.
- No live Supabase two-account mailbox + Realtime test, Android/browser OPFS test, or real linked-device/recovery test has been completed.
