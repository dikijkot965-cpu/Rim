# Iteration 47 — Chat info & pinned messages ownership

**Date:** 2026-11-16  
**Version:** 4.0.0-iteration.47

## Delivered
- `src/application/chat-info-controller.js` — members modal, group add-member, feature actions injection (pinned + wallpaper).
- `src/application/pinned-messages-controller.js` — message_pins load + modal identical to legacy.
- Wired in `src/app.js` with ownership flags and window entrypoints.
- Unit tests: 9 new (chat-info 4, pinned 5). Suite total **272 PASS**.

## Constraints respected
- No design / CSS / HTML structure changes.
- Modal markup matches legacy (titles, classes, button labels, onclick hooks for jump/unpin/close).

## Next priority
- Thin dual-bind on remaining legacy re-assignments of openChatInfo / openPinnedMessages.
- Split `src/app.js` composition root.
- Browser smoke on the new modals + existing settings/profile/send paths.
