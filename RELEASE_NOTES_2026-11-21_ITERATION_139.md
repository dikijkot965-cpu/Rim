# RIM 4.1.8 — Iteration 139

## Zлыдя group experience
- One-tap **Подключить Злыдю к группе** action in group settings.
- The system account posts one introduction message when added to a non-E2E group.
- New group members receive customizable welcome messages with `{user}`, `{user_id}` and `{count}` variables.
- `/menu`, `/zladen`, `/возможности` display the command catalogue; administrative commands are shown only to authorized ranks.
- Public bot identity lookup is handled by an authenticated Edge Function action; group membership still uses the existing server RPC.
- Fixed `/profile UUID` dispatch and `members` visibility enforcement.

## E2E dependency work
- Runtime prefers encrypted OPFS SQLite (`webSqliteStore`) and uses record-encrypted IndexedDB only when OPFS is unavailable.
- Wasm/CSP and OPFS lock errors are not hidden by fallback.
- Installation of `@open-e2ee/signal-protocol-sdk@14.7.0` remains blocked by environment DNS failure (`EAI_AGAIN` on `registry.npmjs.org`). The dependency is pinned in `package.json`, but no real installation, lockfile or bundle is claimed.
- E2E remains disabled; no relay or RIM message transport is complete.

## Validation limits
- Migration 139 not applied; Edge Function not deployed; no production changes.
- SQL runtime, two-account E2E, physical Android and load tests remain pending.
