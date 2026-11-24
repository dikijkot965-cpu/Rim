# RIM 4.1.8 — Iteration 178

## Channel ↔ Feed
- Channel composer includes a saved per-account choice: publish to channel only or to both channel and home feed.
- Managers can manually add an existing public-channel post to the home feed.
- Cross-posts retain source channel/post IDs; a unique index prevents duplicates and a server trigger validates public channel, manager role and source post.
- Channel images are copied into private feed-media. Private and E2E channels are excluded.

## Home feed composer
- Draft text and selected topics autosave per signed-in account and restore when composer reopens.
- Draft clears only after successful publish. Media bytes are not persisted in the local draft and must be reselected after reload.

## Zladen
- Added per-group configurable link blocking and administrator-defined blocked words/phrases.
- Commands: `/filter links on|off`, `/filter word add ФРАЗА`, `/filter word del ФРАЗА`, `/filter words`, `/filter status`.
- Server-side BEFORE INSERT filter rejects matches and writes metadata-only audit events.
- Only owner/admin or rank 4+ can configure filters. Bots and administrators are exempt.
- E2E pending/required scopes are excluded; no server-side plaintext inspection is added to E2E scopes.
- Remaining Iris parity gaps are documented in `ZLADEN_IRIS_PARITY_AUDIT.md`.

## E2E
- No E2E protocol, relay, key, SDK or message-path changes. Relay integration tests use an in-memory test transport, not two live accounts.
- See `docs/E2E_CURRENT_STATUS_ITERATION_178.md`.

## Production migrations
- `20261124102503` — channel/feed cross-post source and validation.
- `20261124103001` — Zladen content filters.
- `20261124103102` — URL regex and filter-limit hardening.
