# openConversation dual-bind inventory

**Date:** 2026-11-16  
**Version:** 4.0.0-iteration.52

Modular ownership path: `LegacyEntrypointRegistry.wrap('openConversation')` → `ConversationOpenCoordinator` → legacy original chain → `afterOpen` (shell, header, presence, timeline side effects).

| Legacy file | Role of wrapper | Conflict with modular? | Guard status |
|-------------|-----------------|------------------------|--------------|
| `03-legacy-03.js` | pin shortcut in chat head | Yes — shell owns chrome | Guarded (`__RIM_CONVERSATION_SHELL_OWNED`) |
| `03-legacy-03.js` | openChatInfo feature actions | Yes — chat info owned | Guarded (`__RIM_CHAT_INFO_OWNED`) |
| `06-legacy-06.js` | `rimApplyGroupAvatars` after open | Yes — shell applies group avatar | Guarded (`__RIM_CONVERSATION_SHELL_OWNED`) |
| `09-rim-grand-expansion-v3-script.js` | reset topic id/title on open | No — additive topic state | Keep (no ownership conflict) |
| `16-rim-release-patch-2026-11.js` | restore chatWindow markup when leaving favorites workspace | No — favorites workspace contract | Keep |
| `18-rim-update-core.js` | full openConversation (load, subscribe, shell chrome) | Shell chrome yes — header/button/avatar | Guarded shell chrome (`__RIM_CONVERSATION_SHELL_OWNED`); loader path still legacy |
| `24-rim-architecture-rebuild-2026-11-05.js` | openConversation body (group button + avatar) | Yes for shell chrome | Guarded group button + avatar under shell ownership |
| `25-rim-stability-consolidated-20261105.js` | direct last_seen status text | Yes — afterOpen + typing/presence own status | Guarded (`__RIM_TYPING_PRESENCE_OWNED` \| shell) |
| `12-rim-restore-layer-2026-11.js` | openChatInfo group avatar edit injection | Yes — chat info owned | Guarded (`__RIM_CHAT_INFO_OWNED`) |

Rule of thumb: if modular `afterOpen` / shell / presence already performs the side effect, legacy must skip under the matching `__RIM_*_OWNED` flag. If the side effect is unique (topic reset, favorites markup restore), keep the wrapper until that feature is modularized.


## Update 2026-11-16 (iteration.59)
- Flag: `__RIM_OPEN_CONVERSATION_OWNED` set in `src/app.js` at `entrypoints.wrap('openConversation')`.
- Guards: `18-rim-update-core.js`, `24-rim-architecture-rebuild-2026-11-05.js` skip assignment when owned.
- Timeline: `__RIM_MESSAGE_TIMELINE_OWNED` + guard on `rimLoadMessagesStable` in 18.
- Message mutations: `message-commands-surface.js` + `__RIM_MESSAGE_COMMANDS_OWNED`.
