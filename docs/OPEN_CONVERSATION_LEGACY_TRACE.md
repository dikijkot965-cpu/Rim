# RIM — `openConversation` runtime trace (iteration 15)

This is a static source trace, not a claim from a live browser session. Script order is taken from `index.html`.

## Effective load order

The legacy scripts load in numeric order through `25-rim-stability-consolidated-20261105.js`, then `assets/js/core/rim-core-release.js`, then the inline `__RIM_LEGACY_CONTEXT`, and finally the ES module `src/app.js`.

## Effective final wrapper chain

Based on the assignments visible in the loaded source:

1. `assets/js/legacy/24-rim-architecture-rebuild-2026-11-05.js` assigns the principal `window.openConversation` implementation. It handles writer save/workspace removal, chat lookup and membership check, active conversation and reply reset, chat DOM state, message loading, message Realtime subscription, read marking, group settings button, group avatar signing and analytics.
2. `assets/js/legacy/25-rim-stability-consolidated-20261105.js` captures that function as `oldOpen` and wraps it to refresh the peer's last-seen label for direct conversations.
3. `assets/js/core/rim-core-release.js` captures the then-current opener and wraps it to bind typing and peer-presence behavior and update outgoing ticks.
4. `src/app.js` installs `ConversationOpenCoordinator` through `LegacyEntrypointRegistry`. It performs writer/favorites pre-navigation cleanup and latest-request-only read-receipt binding and direct-chat header/avatar/presence resolution.

Therefore the runtime call chain at the time the module loads is:

`inline/global openConversation -> ConversationOpenCoordinator -> core-release wrapper -> legacy-25 wrapper -> legacy-24 principal implementation`.

## Earlier assignments and wrappers

- `03-legacy-03.js` wraps the earlier global opener to mark a conversation read and add a pinned-message shortcut, and later wraps it again for a direct-chat avatar paint.
- `06-legacy-06.js` wraps the then-current opener to apply group avatars.
- `09-rim-grand-expansion-v3-script.js` wraps it to reset topic selection.
- `16-rim-release-patch-2026-11.js` wraps it to restore original chat markup before opening.
- `18-rim-update-core.js` assigns another full opener implementation.
- `24-rim-architecture-rebuild-2026-11-05.js` later assigns a full opener again, replacing the `window.openConversation` value established by earlier scripts. Earlier wrappers may still be reachable through separately captured references or lexical bindings, so do not delete them based only on this static assignment order.

## Responsibilities and overlap to investigate

| Responsibility | Current owner(s) | Risk / next investigation |
|---|---|---|
| Writer save and workspace cleanup | Legacy 24; modular coordinator preflight | Possible duplicate cleanup; establish idempotent behavior before removing either path |
| Chat lookup and membership validation | Legacy 24 | Move into repository/use case after characterization; preserve fail-closed access check |
| Active chat and reply reset | Legacy 24 | Must be atomic with navigation; stale in-flight opener can still mutate this state |
| Chat DOM and mobile navigation | Legacy 24 | Preserve current selectors/classes and browser behavior |
| Message history loading | Legacy 24 calls modular stable loader | Keep pagination and Realtime reconciliation contracts |
| Read marking | Legacy 24 and modular coordinator path | Verify duplicate calls and race behavior; do not remove until read-state parity is tested |
| Typing / peer presence / outgoing ticks | Core release wrapper | Candidate bounded migration after browser characterization |
| Direct peer header and avatar | Legacy 25 plus `src/app.js` | Potential duplicate profile/presence lookup and competing status writes |
| Group avatar | Legacy 24; older legacy 06 wrapper may be superseded | Verify actual effective behavior before retiring code |
| Topic reset / pinned shortcut / original markup restore | Earlier legacy wrappers | Determine whether any captured function still invokes them; static order alone is insufficient |

## Known concurrency limitation

`ConversationOpenCoordinator` prevents stale requests from running its own post-open effects and prevents a stale preflight from invoking the legacy opener. It cannot cancel or roll back a legacy opener that has already started and later mutates global active-conversation state or the DOM. The next migration should address this at the principal opener boundary, not add another wrapper.

## Recommended next work

1. Add a real-browser test harness with controllable Supabase mocks and two rapid conversation selections.
2. Assert final active conversation, messages, header, avatar, read receipt channel, typing channel and scroll position.
3. Move membership-scoped chat resolution into a repository/use case.
4. Then move active conversation selection and screen lifecycle into an application controller with a request token, while keeping the current renderer and CSS contract.
5. Retire only wrappers proven unreachable by runtime characterization and static reference analysis.

## Iteration 16 changes

- The principal opener now assigns a monotonically increasing generation at invocation and checks it after writer save, uncached conversation resolution, stable timeline load and group-avatar signing. Stale continuations stop before applying subsequent UI effects.
- Uncached conversation resolution is delegated to `ConversationRepository.getAccessibleConversation` through `window.rimResolveConversationForOpen`; the classic opener retains a fallback only for a missing modular bootstrap.
- The opener no longer performs a second `markConversationRead` after `rimLoadMessagesStable`, because the stable timeline loader already performs that write.
- These changes are covered by repository behavior tests and static legacy integration tests. They are not a substitute for browser-level race testing.
- Retired the superseded `openConversation` wrapper from `assets/js/legacy/17-rim-stability-channel-management.js`. Script 17 loaded before the principal opener in script 24; its wrapper duplicated workspace cleanup and issued a second direct membership/conversation lookup, but its global assignment was later replaced. The file's unrelated channel/admin functionality remains intact.

## Iteration 17 changes

- Active-conversation and reply-target state commits are now delegated by the principal opener to `ConversationNavigationController` through the explicit compatibility setters in `index.html` and `createLegacyBridge`.
- Navigation tokens reject stale commits and mismatched conversation IDs. The legacy opener continues to own existing DOM presentation and message-load invocation.
- Message-history older-page locks are now conversation-scoped; stale page completions cannot mutate the newly active conversation.
- Realtime subscribe requests are tokenized separately from subscription lifetime. If a newer conversation is selected while an old channel is being removed, the old request does not attach its channel afterward.
- These guarantees are unit/static integration tested. The browser-level rapid-switch scenario remains unverified and is a priority for iteration 18.
