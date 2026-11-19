# Dual-bind coverage (iteration.76)

## Heavily guarded (hot paths)
18, 24, 25 — open, timeline, shell, forward, settings, channel settings
03, 06 — open, shell, compose, decorations, channel feed
12 — admin, chat-info, send (commands)
14, 15, 17 — render, loadMessages, openChannel
05, 08 — nav, profile
09 — settings, send
11 — reports
13, 19, 20, 23 — admin/channels/groups
16 — favorites row
21 — search

## Low risk / intentional leftover
02 — foundational function declarations (globals); modular + entrypoints overwrite at boot
07 — nav DOM cleanup only
10 — invokes window.openMorePage/openToolsPage (modular handlers)

## Stage B next
Browser smoke on open/send/list/channel/group/settings.
Then no-op bodies where unique logic is gone; then script-tag removal (C).
