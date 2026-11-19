# Iteration 55 — social surface + forward route restore

**Date:** 2026-11-16  
**Version:** 4.0.0-iteration.55

## Delivered
- `src/composition/social-surface.js`: DirectChatService, ReportService, ForwardMessageService.
- Window routes for forward (`rimForwardChoose`, `rimForwardMessage`, `rimDoForward`, `rimForward`) bound modularly again (previously only `__RIM_FORWARD_OWNED` was set).
- Bugfix: `container.value('search', searchController)` (was multi-arg misuse).

## Phase clarity
Still thinning dual-binds and extracting composition. Legacy script count remains 24; deletion requires parity + smoke.
