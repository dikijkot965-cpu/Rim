# RIM 4.0.0 — iteration 8 report

Date: 2026-11-14  
Version: `4.0.0-iteration.8`

## Scope

Move the channel directory read model and subscription filter out of legacy script `17` into the modular application/repository layers. Preserve the existing channel-list classes, wording, public/private behavior and join/open commands. No visual redesign.

## Implemented

- Added `src/infrastructure/supabase/channel-repository.js`.
- Added `src/application/channel-directory-controller.js`.
- The repository reads the newest 300 channels using only the five fields required by the directory: `id,title,description,is_public,username`.
- Membership is determined from `channel_members` for the authenticated user, not from a visual flag or the channel's public/private state.
- The controller owns the existing `all` / `subscribed` filter, creates the existing selector, renders the existing `.rim-channel-row`, `.rim-channel-avatar`, `.rim-channel-copy`, `.rim-channel-meta` and action classes, and delegates actions to the existing `openChannel` / `rimJoinChannel` functions.
- List actions use delegated `data-*` attributes rather than interpolated inline JavaScript handlers.
- Dynamic channel values are HTML-escaped.
- Request sequence protection prevents a slower previous filter/load from overwriting the latest result.
- The controller invalidates pending work on sign-out and disposes its delegated event listener with the application lifecycle.
- `src/app.js` composes the new repository/controller and exposes compatibility entry points `window.loadChannels` and `window.rimFilterChannels`.
- Legacy `17` no longer owns the channel-directory query, membership query, filter selector, scope state or list renderer. It still owns channel join/leave RPC commands, moderation/settings, channel admin tools and other unrelated features.

## Legacy retirement

This pass retires one bounded channel-directory responsibility slice from legacy `17`. It does **not** delete the file.

- 24 legacy JavaScript files remain on disk and referenced by `index.html`.
- No legacy file was deleted in this pass.
- `index.html`, visible HTML markup and CSS files were not changed.
- Channel post feed, comments, reactions, moderation, group management and channel mutations remain on their existing paths.

## Verification

`npm run verify`: PASS.

- Project check: 46 JavaScript files discovered; local HTML assets resolved.
- Syntax check: 71 JavaScript files passed.
- Node tests: 89 passed, 0 failed.
- Added 13 focused Node tests across repository, controller and legacy integration contracts.
- Added `tests/channel-directory-browser-smoke.html` for a real-DOM check of rendering, filtering, escaping and delegated actions.

A headless Chromium run was attempted against the browser smoke and existing runtime fixtures, but Chromium hung before returning DOM output (including with single-process/no-zygote flags). Therefore the browser fixture is present but **not counted as executed or passed**. No Android execution, live two-account Supabase E2E, production latency benchmark or load test was run. No production SQL, RLS, Storage, Auth or data changes were applied. No 10k concurrency claim is made.

## Remaining limitations

- The channel directory still reads up to 300 channel rows per load; pagination or server-side visibility filtering may be warranted after reviewing the actual RLS policy and expected channel count.
- Live verification is still required to confirm channel visibility and membership RLS behavior on the target Supabase project.
- Join/leave mutations remain in legacy `17` and call existing RPCs. They were intentionally not rewritten without reviewing the RPC contracts and deployed policies.
- No browser visual check has been run for the channel list on Android WebView/Chromium.
- Group metadata and channel moderation/settings remain in legacy scripts.

## Next pass

Continue the bounded channel/group audit. A strong candidate is the read-only group metadata/member projection used by group settings, but first map every caller and its permission assumptions. Keep role changes, owner transfer, invite operations and membership mutations on the current RPC path until the deployed SQL/RLS contracts are reviewed. Do not add another legacy wrapper chain.
