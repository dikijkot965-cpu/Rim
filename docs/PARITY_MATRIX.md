# RIM Parity Matrix (iteration.70+)

Goal: each row has modular owner + flag + test + (eventually) smoke.

| Flow | Modular owner | Flag | Dual-bind guard | Unit/integration | Browser smoke |
|------|---------------|------|-----------------|------------------|---------------|
| Open conversation | conversation-open-surface | `__RIM_OPEN_CONVERSATION_OWNED` | 18/24/25 | yes | pending |
| Load messages | message-timeline-surface | `__RIM_MESSAGE_TIMELINE_OWNED` | 18 | yes | pending |
| Send/edit/delete/react | message-commands-surface | `__RIM_MESSAGE_COMMANDS_OWNED` | partial | yes | pending |
| Conversation shell | conversation-session-surface | `__RIM_CONVERSATION_SHELL_OWNED` | 18/24/25/06 | yes | pending |
| List paint / load | session + legacy-entrypoint | LIST_RENDER / FAVORITES | 16/18/24 | yes | pending |
| Channel directory/feed/settings | channels-surface | CHANNEL_*_OWNED | 25 settings guard | yes | pending |
| Group settings/commands | groups-surface | GROUP_*_OWNED | partial | yes | pending |
| Settings/privacy/profile | settings-surface | SETTINGS_SHELL etc. | 25 | yes | pending |
| Direct/report/forward | social-surface | multiple | partial | yes | pending |
| Admin/imperial | admin-surface | ADMIN/IMPERIAL | partial | yes | pending |
| Search/nav/compose/session | shell-surface | multiple | partial | yes | pending |
| Runtime (receipts/voice/typing) | chat-runtime-surface | multiple | 25 typing | yes | pending |
| Features (writer/favorites/music) | features-surface | FEATURES_SURFACE | — | partial | pending |
| Peer avatars | PeerAvatarService | — | — | yes | pending |

Fill smoke column when a browser environment is available.

## Stage note
Stage A: dual-bind thinning. Stage B: no-op + smoke. Stage C: remove legacy script tags.
