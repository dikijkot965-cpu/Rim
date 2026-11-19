# RIM 2.1.2 — engineering continuation audit

Source archive: `RIM_2.1.1_ENGINEERING_PASS_2026-11-06.zip` (user-provided)

## Changes made in this pass

- Direct-message peer visibility now fails closed: only `profiles.show_online === true` permits presence/last-seen display. A null/missing projection no longer implicitly exposes presence.
- Direct-message header update checks the active conversation again after the asynchronous profile lookup, preventing a slow response for chat A from overwriting chat B's header.
- Direct-message header now updates the avatar when a trusted HTTPS `avatar_url` exists and otherwise uses a text initial. The UI does not treat an arbitrary storage path as a URL.
- Writer navigation now flushes the document and removes the old `#rimWorkspaceOverlay` before opening Favorites or another conversation. This fixes the competing-overlay lifecycle path introduced by having both the legacy workspace and modular Favorites.
- Added dedicated Lite Writer layout/typography rules, readable paragraph spacing, a document canvas, a compact mobile layout, and hidden-by-default toolbar behavior. Existing imperial theme tokens are reused.
- Channel settings now render the editable settings shell immediately after the permission check. Group list, subscribers and moderation data hydrate asynchronously; a slow secondary query no longer delays the main settings form.
- Local music statistics now distinguish starts from completed listens, accumulate listening time, and keep daily counts for today/last seven days/all time. The existing player and music design were not redesigned. Statistics remain local in IndexedDB; no audio file is uploaded.
- IndexedDB record format is backward-compatible: new statistic fields are optional record properties; the object store is not deleted or recreated.
- Added unit tests for privacy fail-closed behavior, missing peers, music aggregation and listening-time formatting.

## Verification actually performed

- `npm test`: 10 tests passed.
- `npm run check`: passed; 19 project JS files checked by the repository script and local HTML references resolved.
- `node --check` over JavaScript/MJS files in `src`, `tests`, `scripts`, and `assets/js`: passed.
- ZIP integrity checked after packaging.

## Not completed / not certified

- The 25 legacy classic scripts remain loaded by `index.html`. Their responsibilities have not yet all been migrated into Clean Architecture. Removing them now would risk dropping mature features without browser characterization tests.
- Typing Broadcast is now private. Two RLS policies on `realtime.messages` authorize send/receive only when `auth.uid()` is a member of the conversation encoded in the `rim-typing-<uuid>` topic. The client sets `private: true`, refreshes Realtime auth, stops stale timers on chat switch, and restores the real peer-status text after typing. The migration was applied and the two policies were read back successfully. Cross-account browser behavior, reconnect, and multi-typist behavior remain unverified.
- Unread counts exist in legacy code but still perform per-conversation count queries; a server-side aggregate/RPC and full multi-device read-cursor verification remain outstanding.
- Sent/read ticks, pagination, virtualized message rendering, and N+1 profile/query review are not complete.
- Favorites note/message persistence and attachments need full integration tests; visual regression testing has not been run.
- Lite Writer navigation and typography have been changed, but Quill browser behavior, paste/format fidelity, autosave race handling and real phone keyboard behavior require browser tests.
- Music statistics are local and implemented in the module; actual IndexedDB/audio playback tests on Android and migration behavior with existing local libraries have not been run in a browser.
- Supabase production schema was not structurally changed except for the two scoped Realtime Broadcast RLS policies described above. A read-only policy/schema/advisor review was performed. The security advisor reports six RLS-enabled tables without policies, 25 SECURITY DEFINER functions executable by `anon`, 53 executable by `authenticated`, and leaked-password protection disabled. A separate policy inspection found `Profiles visible to authenticated` uses `USING (true)`, so `profiles.last_seen_at` is directly readable by every authenticated user even when `show_online = false`. The UI now hides the value when privacy is off, but the database currently does not enforce that privacy boundary. This is a critical remaining privacy issue; it must be fixed with a reviewed server-side presence projection/private storage and a coordinated client-query migration, not by hiding text in JavaScript. These findings require per-function and per-table review; they were not mass-modified because some functions enforce `auth.uid()`/role checks internally and some token tables may intentionally be server-only. The performance advisor reports multiple permissive policy overlaps and five duplicate index pairs.
- No browser E2E, two-account privacy test, mobile visual comparison, staging load test, or 100k concurrency test was performed.

## Release gate

This is an incremental build with concrete fixes, not completion of the full 19-section technical specification and not a 100k-user certification. The remaining work must continue feature-by-feature with characterization and browser tests before legacy modules are removed.
