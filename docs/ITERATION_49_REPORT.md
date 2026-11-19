# Iteration 49 — Shell owns pinned shortcut; comment cleanup

**Date:** 2026-11-16  
**Version:** 4.0.0-iteration.49

## Changes
1. **Comment policy:** removed non-technical / roleplay wording from application and composition modules and from legacy guards. Code comments stay technical.
2. **Pinned shortcut ownership:** `ConversationShellController.ensurePinnedShortcut()` creates the existing `#pinnedShortcut` icon button (same id/class/title/glyph). Called from `applyAfterSelection`.
3. **Dual-bind thin:** legacy `03-legacy-03.js` no longer injects the pin button when `__RIM_CONVERSATION_SHELL_OWNED` is true.
4. **Tests:** shell suite asserts pin button on group and direct chats; idempotent ensure; suite total 274 pass.

## Non-goals (unchanged)
- No design, CSS, HTML structure, or ID changes.
- No change to modal markup for pinned messages or chat info.
