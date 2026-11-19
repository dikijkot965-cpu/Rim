# Iteration 58 — shell surface + message-load ownership

**Date:** 2026-11-16  
**Version:** 4.0.0-iteration.58

## Delivered
- `src/composition/shell-surface.js` binds session, notifications, member card, calls placeholder, nav pages, compose chat, imperial cabinet, search.
- `__RIM_MESSAGE_TIMELINE_OWNED` set when modular `loadMessages`/`rimLoadMessagesStable` bound.
- Legacy `18-rim-update-core.js` skips its `rimLoadMessagesStable` assignment when modular owner is active.
- `__RIM_MESSAGE_COMMANDS_OWNED` for send/edit/delete/react path.

## Phase
Composition roots: chat-audience, settings, channels, groups, social, admin, **shell**.
Legacy scripts: 24 (guards added, no deletion).
