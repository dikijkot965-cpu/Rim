# RIM 4.0.0 — Iteration 11 Report

**Version:** `4.0.0-iteration.11`  
**Date:** 2026-11-14  
**Scope:** Channel settings read model (shell + ancillary hydration) from legacy `17`.

## Implemented

- `src/infrastructure/supabase/channel-settings-repository.js` — canManage, groups, members+profiles, moderation RPC
- `src/application/channel-settings-controller.js` — shell first, ancillary after, data-rim-cs-action, stale guards
- `window.rimOpenChannelSettings` routed to controller
- Mutations remain in legacy `17` (`rimSaveChannelSettings`, `rimModerateChannel`, `rimChannelUnrestrict`, avatar)

## Verification

`npm run verify`: PASS — **126** tests, 0 failed.  
No production Supabase changes. 24 legacy scripts remain loaded. UI/CSS unchanged.

## Next

Group/channel mutation extraction after RPC review, or remaining legacy prioritisation.
