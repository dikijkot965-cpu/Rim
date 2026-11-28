# RIM 4.1.8 — Iteration 183

## Group creation baseline
- Preserve the latest main-branch fix for the production `create_group_chat` RPC contract and automatic opening of newly created groups.
- Preserve the latest main-branch delegated search navigation and direct-chat E2E verification UI.

## Channel creation consistency
- Fail closed if owner membership cannot be created after the channel row is inserted.
- Best-effort rollback removes the channel row and uploaded avatar; rollback failures are logged and surfaced explicitly.
- Reject unsupported avatar MIME types before upload.

## UI and deployment
- Bump browser script cache keys to the 183 release marker so clients do not retain the old 181/182 bundles.
- Remove the decorative RIM wordmark from the main application header; authentication branding remains.
- Build workflow produces a complete source ZIP and SHA-256 checksum as a GitHub Actions artifact.

## Compatibility and security
- No production SQL migration.
- No changes to Signal Protocol, key material, ciphertext storage, relay, or E2E policy.

## Verification boundary
- Full CI, browser bundle build, architecture checks, syntax checks, HTML audit, regression suite and Signal relay tests must pass.
- Live multi-account Android acceptance remains required for channel creation, group creation, feed publishing, E2E activation and music playback.
