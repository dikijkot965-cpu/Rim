# Iteration 51 — dual-bind inventory + capacity honesty

**Date:** 2026-11-16  
**Version:** 4.0.0-iteration.51

## Code
- `assets/js/legacy/25-rim-stability-consolidated-20261105.js`: skip redundant last_seen DB work and status paint when `__RIM_TYPING_PRESENCE_OWNED` or `__RIM_CONVERSATION_SHELL_OWNED`.
- Tests: dual-bind guards cover legacy 25.

## Documentation
- `docs/OPEN_CONVERSATION_DUAL_BIND_INVENTORY.md` — table of every known openConversation wrapper, conflict, guard status.
- `docs/CAPACITY_AND_SCALE.md` — what current stack can and cannot support; ladder toward large scale; explicit rejection of "free 1B users" claims.

## Non-goals
- No UI changes.
- No backend schema changes in this iteration.
