# RIM 4.1.8 — Iteration 137

**Focus:** Zлыдя group administration, E2E protocol selection and security boundaries.

## Added

- Zлыдя group settings: welcome message and rules.
- Group commands: `/rules`, `/info`, `/admins`, `/stats`, `/setrules`, `/setwelcome`.
- Moderation: `/warn`, `/warnings`, `/clearwarns`, `/mute`, `/unmute`, `/kick`, `/ban`, `/unban`.
- Custom group text commands: `/command`, `/delcommand`.
- Audit rows for moderation and configuration actions.
- Database-level mute enforcement on message insert and ban enforcement on group membership insert.
- Safe reactivation of a blocked/unsubscribed personal Zлыдя chat.
- E2E scope isolation: Zлыдя's plaintext trigger paths skip groups already marked `required`.
- E2E SDK research note and implementation sequence.

## Not included

- Full Iris feature parity. Zлыдя is a first-party group helper with a meaningful initial moderation module, not a finished Iris replacement.
- Full E2E protocol integration. No new protocol dependency was installed, no custom relay was built, and no message send/read path uses ciphertext.
- Encrypted attachments, multi-device E2E fanout, group ratchet integration, identity verification UI or recovery/transfer.
- Production SQL execution or Edge Function deployment.

## Verification

- `npm run check` — PASS, 116 mapped source modules.
- `npm run check:syntax` — PASS, 307 JavaScript files.
- `npm test` — PASS, 484/484.
- `npm run audit:html` — completed; 93 sites classified (14 review, 24 ok, 55 static). Existing review findings remain.
- `npm run test:e2e` — skipped; `@playwright/test` is not installed.
- `npm run build:cloudflare` — PASS, 156 Worker assets and 157 Pages-only files.
- SQL migration was not executed against PostgreSQL; review and staging validation are required before production apply.

## Security posture

E2E remains OFF. Do not display a production E2E badge. The experimental AES-GCM envelope remains non-production and is not wired to messages. The evaluated SDK is a candidate only and reports no independent security-firm audit. Browser-origin compromise and XSS remain relevant to web E2E.

## Deployment

No live Supabase schema or Edge Function was changed. Iteration 137 migrations must be reviewed and applied through the established Supabase migration process. `rim-zladen` Edge Function still needs deployment and `RIM_OWNER_USER_ID` configuration if not already configured.
