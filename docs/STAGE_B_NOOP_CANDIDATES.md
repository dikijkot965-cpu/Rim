# Stage B — no-op candidates (after browser smoke)

**Rule:** body may become early-return / empty only when modular owns the flow, dual-bind tests pass, and smoke did not show a gap.

| Legacy site | Condition | Status |
|-------------|-----------|--------|
| 12 `sendMessage` wrap (block preflight) | `__RIM_MESSAGE_COMMANDS_OWNED` | Modular canSend own+reverse block. Candidate after smoke. |
| 09 `sendMessage` seasonal wrap | MESSAGE_COMMANDS_OWNED | Guarded. |
| 18/24 `openConversation` bodies | OPEN_CONVERSATION_OWNED | Guarded assign. |
| 25/24 forward | FORWARD_OWNED | **Modular ForwardMessageService now copies image, attachment_path, chat_message_attachments (iter.78).** Candidate after smoke. |
| 14 full `renderMessages` | LIST_RENDERER_OWNED | Guarded assign. |
| 05/08 nav page assigns | NAV_PAGES_OWNED | Guarded. |

## Smoke checklist (browser)
1. Open direct + group conversation
2. Send text; blocked peer both directions
3. Load older messages
4. Channel open/join/settings
5. Group settings
6. Forward message **with attachment**
7. Settings / profile / search
