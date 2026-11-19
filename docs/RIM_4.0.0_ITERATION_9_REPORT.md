# RIM 4.0.0 — Iteration 9 Report

**Version:** `4.0.0-iteration.9`  
**Date:** 2026-11-14  
**Scope:** Bounded read-only group settings projection (legacy `20`).

## Goal

Continue the modular modernization started in prior iterations. Move the **group settings open/read/render** path out of `assets/js/legacy/20-rim-update-groups.js` into a repository + controller pair, while preserving:

- existing imperial UI markup, CSS classes and wording;
- all mutation/authorization behaviour on existing RPCs;
- no production SQL / RLS / Storage / Auth changes.

## What was implemented

### New modules

- `src/infrastructure/supabase/group-repository.js`  
  Read-only projection: conversation (narrow columns), members (`user_id, role, joined_at`), profiles (`id, username, display_name`). Computes `isManager` / `isCreator`.

- `src/application/group-settings-controller.js`  
  - Loads the projection.  
  - Enforces the existing manager gate.  
  - Renders the settings modal with the same structure, labels and classes.  
  - Escapes all dynamic values.  
  - Uses `data-rim-group-action` + delegated listeners instead of inline `onclick` with interpolated IDs.  
  - Discards stale async results; invalidates on sign-out / dispose.  
  - Delegates every mutation (save, roles, members, invite, avatar, leave, transfer) back to the existing `window.rim*` entrypoints that remain in legacy `20`.

### Integration

- `src/app.js` composes `GroupRepository` + `GroupSettingsController`.
- `window.rimOpenGroupSettings` now routes to the controller.
- Auth sign-out invalidates both channel directory and group settings pending loads.
- Version bumped to `4.0.0-iteration.9` in `package.json`, logger, `window.RIM` and `rim:ready` event.

### Intentionally unchanged

- All mutation functions remain in legacy `20` (`rimSaveGroupSettings`, `rimGroupAddMember`, `rimGroupRemoveMember`, `rimGroupSetRole`, `rimGroupLeave`, avatar upload, invite create/copy/revoke, transfer owner, join by invite).
- Legacy file `20-rim-update-groups.js` is **not** deleted and remains loaded from `index.html`.
- `index.html` visual markup, CSS files and interaction vocabulary are unchanged.
- No production Supabase schema, RLS, Storage, Auth or data changes.

## Tests

- `tests/group-repository.test.js` — column selection, manager/non-manager, error paths, non-group rejection.
- `tests/group-settings-controller.test.js` — escaping, data-action markup, manager gate, stale discard, error surface.
- `tests/group-legacy-integration.test.js` — routing contract, mutation entrypoints still present, module exports, legacy script still referenced.

## Verification

`npm run verify`: **PASS**

- Project check: 51 JS files; local HTML assets resolved.
- Syntax check: 76 JavaScript files passed.
- Node tests: **104 passed, 0 failed**.

No browser/Android E2E, two-account live Supabase E2E, or load test was run. No 10k concurrency claim is made.

## Remaining limitations

- Group settings mutations still live in legacy `20` and call existing RPCs.
- Live staging verification is still required for membership/role RLS behaviour.
- Channel feed, comments, reactions remain in legacy `19`.
- 24 legacy JavaScript files remain loaded.
- Headless browser fixtures remain unverified in this environment.

## Next pass suggestion

Choose one of:

1. Continue bounded mutation extraction for group RPCs **after** reviewing deployed RPC contracts and RLS (do not rewrite blind).
2. Channel feed / comments / reactions read path from legacy `19` (same read-only projection style).
3. Inventory and prioritise remaining high-traffic legacy call sites (list in `docs/LEGACY_INVENTORY.md`).
