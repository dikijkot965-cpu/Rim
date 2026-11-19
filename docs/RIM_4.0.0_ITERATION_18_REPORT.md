# RIM 4.0.0 — Iteration 18

**Version:** `4.0.0-iteration.18`  
**Baseline:** iteration 17  
**Date:** 2026-11-15

## Scope

Own typing broadcast and peer-presence status text in the application layer, with stale-bind protection during rapid conversation switching. Prevent double-subscription with `rim-core-release.js`.

## Changes

1. Added `src/application/typing-presence-controller.js`
   - conversation-scoped `rim-typing-<id>` broadcast channel
   - bind sequence discards stale async work
   - peer presence status for direct chats
   - input throttle / idle clear for local typing signals
2. Wired into `ConversationOpenCoordinator.afterOpen` after read-receipt bind
3. `window.__RIM_TYPING_PRESENCE_OWNED` flag; rim-core skips `bindTyping` / `showPeerPresence` / `bindTypingInput` when set
4. Module map + check-project version aligned to 18

## Verification

`npm run verify` PASS — **161** tests. No production SQL. UI/CSS unchanged. 24 legacy scripts remain.
