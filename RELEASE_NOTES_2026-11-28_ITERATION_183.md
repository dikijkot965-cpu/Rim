# RIM 4.1.8 — Iteration 183

## Preserved main-branch fixes
- Production group creation now uses the corrected `create_group_chat` RPC contract and opens the new group.
- Search result clicks use delegated navigation for people, channels, messages and public groups.
- Direct-chat E2E verification action is retained.
- Feed publish click resolves the current asynchronous Supabase publisher at click time.
- Chat bootstrap placeholders no longer display false "module still loading" notifications before modular entrypoints are ready.

## Channel creation consistency
- Fail closed if owner membership cannot be created after the channel row is inserted.
- Best-effort rollback removes the channel row and uploaded avatar; rollback failures are logged and surfaced explicitly.
- Reject unsupported avatar MIME types before upload.

## UI and deployment
- Wire the existing ChatInfoController to the chat header information button, with explicit failure notification.
- Bump browser script cache keys to the 183 release marker so clients do not retain the old 181/182 bundles.
- Remove the decorative RIM wordmark from the main application header; authentication branding remains.
- Build workflow produces a complete source ZIP and SHA-256 checksum as a GitHub Actions artifact.

## Database migration
- Includes the main-branch migration `20261128053459_rim_iteration_183_zladen_help_details.sql`, which adds command-specific `/help <command>` explanations and supports custom command/alias descriptions.
- Apply this migration to the connected Supabase project before expecting the new command-help responses. This branch adds no further schema changes.

## Compatibility and security
- No changes to Signal Protocol, key material, ciphertext storage, relay, or E2E policy.

## Verification boundary
- Full CI, browser bundle build, architecture checks, syntax checks, HTML audit, regression suite and Signal relay tests must pass.
- Live multi-account Android acceptance remains required for channel creation, group creation, feed publishing, E2E activation and music playback.
