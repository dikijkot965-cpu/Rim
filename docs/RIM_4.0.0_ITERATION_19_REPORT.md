# Iteration 19

Consolidated presence and read-receipt ownership so rim-core no longer double-subscribes or double-paints ticks when modular runtime is active.

## Modules
- `src/application/own-presence-controller.js` (new)
- flags: `__RIM_READ_RECEIPTS_OWNED`, `__RIM_OWN_PRESENCE_OWNED` (plus existing typing flag)

## Verify
165 Node tests passed. No production Supabase changes. UI unchanged.
