# RIM Full Statistics — iteration 39

## Code mass
- Modular src: 328,098 bytes (39.1%)
- Legacy: 486,620 bytes (58.0%)
- Core: 24,564 bytes (2.9%)
- Application modules: 27
- Test files: 78
- Ownership flags: 13

## window.* routes
- Modular assigns: 81
- Legacy/core names: 203
- Overridden (both): 66
- Only legacy: 137
- Only modular: 15
- Modular influence among named routes: 37%

## Remaining generations (estimate)
- To “normal hot path / scalable”: ~12–22 generations
- To bulk-delete many legacy files: +15–25 more
- Critical remaining: profile UI, settings shell, forward/report/block, calls stub, music leftovers, app.js split, legacy dual-bind cleanup
