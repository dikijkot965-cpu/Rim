# RIM 3.0.0 — Engineering Migration

## Implemented
- Replaced the previous direct-peer resolver with a bulk repository method and a cached-profile-first header resolver.
- Decorated the existing chat list with peer display names and avatars without changing its overall DOM layout.
- Added Storage signed-URL resolution for profile avatars.
- Replaced the active Lite Writer entry point with a self-contained feature module. The editor uses a white paper surface and dark readable text, supports basic formatting, document selection, creation, autosave and manual save.
- Added local persistence fallback if the Supabase writer table is unavailable.
- Added an additive RLS migration for `rim_writer_documents`; it is included but not applied.
- Changed manifest and icon paths to relative URLs for GitHub Pages project subpaths.

## Verification
- `npm run check`: passed.
- `npm run check:syntax`: passed.
- `npm test`: 18 passed, 0 failed.

## Not verified
- Real browser interactions on Android.
- Two-account direct-chat lookup against the production Supabase project.
- Supabase migration execution.
- Browser visual regression, offline reload on device, or load testing.

## Migration status
25 legacy scripts remain in the runtime. The release migrates the direct-message identity and Lite Writer slices, but does not claim that every legacy function has been rewritten. Further slices require characterization tests and parity verification.
