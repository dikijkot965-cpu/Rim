# RIM 4.1.8 — Iteration 177

## Zladen

- Added safe group mini-games: `/games`, `/roll`, `/random`, `/choose`, `/yesno`, `/percent`, `/who`, `/pair`, `/say`.
- Added neutral social actions: `/highfive`, `/handshake`, `/congrats`, `/praise`, `/apologize`.
- Added per-group game activity counters and `/game_stats`, `/game_top`.
- No wagering, cash stakes, betting mechanics, or romantic roleplay.
- Commands fail closed in E2E `pending` and `required` scopes.

## Feed

- Multiple attachments per post, including images, video, audio and supported documents.
- Attachments can be inserted at the text cursor; image files can also be pasted or dropped into the composer.
- Limited Markdown-style bold/italic formatting, safe escaped rendering, and post topic selection.
- Explicit topic-interest preferences stored in Supabase.
- Recommendation ranking uses topic preferences, follows, likes, comments and recency; muted topics and authors are excluded.
- Existing likes, comments, saves and following feed remain. Comments are still flat rather than threaded.

## Imperial panel

- Searchable channel and group directories backed by superadmin-only RPCs, returning up to 1,000 records.
- Collapsible channel/group cards.
- Per-channel and per-group image/video restrictions enforced by Storage RLS, not merely by hiding client controls.
- Configurable group/channel welcome notifications and global new-user welcome notifications.
- Individual or all-user system notices through the existing admin notification RPC.

## SDK and E2E

- Restored the offline bootstrap dependencies from the user's Library artifact.
- Verified SDK tarball SHA-512 against the supplied expected hash.
- Verified `createSignalProtocolClient` import and both browser-store entrypoints.
- Kept `@open-e2ee/signal-protocol-sdk@14.7.0`, `idb@8.0.3`, and `esbuild@0.27.0` pinned.
- Kept RIM's root `package-lock.json`; did not replace it with the bootstrap lockfile.
- E2E protocol, relay, device keys and E2E SQL were not modified.

## Production migrations applied

- `20261124094152` — `rim_iteration_177_imperial_controls`
- `20261124110000` — `rim_iteration_177_zladen_social_games`

## Boundaries still requiring later work

- This is not complete Iris parity; see `ZLADEN_IRIS_PARITY_AUDIT.md`.
- Admin notices and welcome messages are RIM in-app notifications, not direct messages sent from another user's account.
- Feed editor is not yet a full WYSIWYG editor; comments are not nested; there is no complete creator studio.
- Android real-device smoke testing and multi-account acceptance remain necessary.