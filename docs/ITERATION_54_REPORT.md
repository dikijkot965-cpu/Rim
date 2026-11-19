# Iteration 54 — groups composition root

**Date:** 2026-11-16  
**Version:** 4.0.0-iteration.54

## Delivered
- `src/composition/groups-surface.js` binds GroupSettingsController and GroupCommandService.
- Routes: open settings, create, join public, save settings, members/roles, leave, avatar, invites, transfer owner.
- Ownership: `__RIM_GROUP_SETTINGS_OWNED`, `__RIM_GROUP_COMMANDS_OWNED`.
- `app.js` reduced; auth SIGNED_OUT still invalidates groupSettings via composition return value.

## Non-goals
- No UI changes.
- No legacy group script deletion.
