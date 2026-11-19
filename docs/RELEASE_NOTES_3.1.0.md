# RIM 3.1.0 — Runtime modernization

## What changed in this engineering update

- Added a dedicated conversation-list controller. Peer profiles are resolved in one batched repository request; visible names, usernames and avatars are projected into the existing chat-list DOM without changing its visual design.
- Avatar signing now uses a short-lived in-memory cache. Multiple rows referencing the same avatar path share one in-flight request.
- Avatar rendering runs concurrently rather than awaiting each row sequentially. Stale render work is discarded when a newer list render starts.
- Conversation header avatar requests are sequence-guarded so a slow response from a previously opened chat cannot overwrite the currently selected chat.
- Added a centralized legacy entry-point registry. New compatibility wrappers are now registered in one module and can be safely disposed without overwriting a later owner.
- Added `DisposableScope` to own event listeners, observers and runtime cleanup; the runtime now exposes an explicit `RIM.dispose()` entry point.
- Fixed a Lite Writer autosave race: queued saves now resolve the cloud-generated document ID when the queued operation executes, preventing rapid consecutive autosaves from inserting duplicate documents.

## Validation

The project check, JavaScript syntax check and Node test suite are run for this archive (27/27 tests pass). These checks do not replace a live browser test against the user's Supabase project or Android device. No production database migration is applied by this release.

## Migration status

This is a real modernization increment, not a claim that every legacy script has already been replaced. The 25 legacy scripts still contain feature implementations and are retained as the compatibility runtime. Removing them requires feature-by-feature parity tests against the real Supabase schema and browser behavior. No existing features or database records were intentionally removed.
