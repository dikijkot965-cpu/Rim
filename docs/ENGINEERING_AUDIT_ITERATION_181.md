# RIM 4.1.8 — Engineering audit, Iteration 181

Date: 2026-11-27  
Scope: repository source, browser entrypoints, application composition, Supabase projections and the automated CI checks available in this repository.

## Executive assessment

The project has a meaningful modular foundation, but it is **not yet at a level that can honestly be described as “MIT-level” or as a fully modern, professionally finished codebase**. “MIT-level” is not a measurable software certification. The useful engineering tests are architecture boundaries, security properties, reliability under failure, maintainability, performance measurements and repeatable tests.

RIM is currently a hybrid application: modular JavaScript under `src/` coexists with a sizeable legacy browser shell and compatibility entrypoints. This is a valid migration stage, but it leaves duplicate ownership and implicit global contracts that must be removed before the codebase can be called cleanly modernized.

## Verified repository facts

The CI architecture check reports:

- 126 mapped source modules.
- 24 legacy scripts retained for compatibility.
- 372 JavaScript files included in syntax verification.
- 123 `innerHTML` sites in the current HTML audit: 62 classified static, 32 classified acceptable by the audit rules, and 29 requiring manual review.
- The full unit/regression suite is run in CI, as are two Signal relay integration checks.
- Signal SDK 14.7.0 and its browser store entrypoints are verified during the build.

These figures describe the automated checks, not a proof that every user journey or every security boundary is correct.

## Architecture assessment

### What is already sound

1. **Layer separation exists.** The project has distinct `domain/`, `application/`, `infrastructure/`, `composition/` and `security/` areas.
2. **Composition roots are explicit.** `src/app.js` wires repositories, services, controllers and lifecycle cleanup rather than requiring every module to construct its own dependencies.
3. **Supabase access has repository/service boundaries** in several critical areas, including conversations, channels, groups and E2E scope handling.
4. **Result values are used** in newer application services, which makes expected failures more explicit.
5. **The E2E runtime is kept behind the composition container.** The application does not expose a generic plaintext bypass for protected conversations.
6. **Automated regression coverage is substantial** for a JavaScript application of this size.

### Structural debt that remains

1. **The legacy browser shell is still a large integration surface.** `index.html` contains UI markup, event wiring, local state, Supabase queries and several feature implementations. This makes changes harder to isolate and review.
2. **Global `window.*` functions remain part of the application API.** They are useful compatibility bridges, but their ownership and lifecycle need to be documented and gradually replaced with controller/service calls.
3. **Legacy scripts remain active.** The 24-script compatibility layer means the modular source tree is not yet the only source of runtime behavior.
4. **Dynamic HTML remains common.** The 29 manual-review `innerHTML` sites need a prioritized XSS review. Escaping user-controlled text is necessary but does not automatically make every dynamic HTML construction safe.
5. **Several controllers/services are large.** For example, channel feed behavior is still concentrated in a large controller. It should be separated by responsibility only when tests protect the existing behavior.
6. **JavaScript has no complete static type system here.** Syntax checks catch parse errors, not incorrect data shapes or invalid cross-module contracts.
7. **The browser-level acceptance layer is incomplete.** Node tests and relay tests do not prove that the rendered mobile UI, touch interactions, real Supabase RLS and authenticated E2E flows all work together.

## Iteration 181 engineering changes

- Global search now opens the modular `SearchController`, rather than the old local chat-name-only overlay.
- Group search uses actual `conversations` columns (`is_private`, not a nonexistent `is_public` or `username`).
- Secret direct chat creation is exposed through the create menu and delegates to the existing `DirectChatService`; the Signal protocol itself is unchanged.
- Private-group E2E activation is exposed from the group information panel. The E2E button is no longer placed in the group header.
- Channel administration flags are derived from channel ownership and channel membership roles, not a global RIM owner shortcut.
- Conversation header avatars are cleared on every selection before asynchronous avatar resolution, preventing the previous group image from leaking into the next header.
- Profile avatars are loaded from the signed avatar path on authentication/profile changes; the previous four-second polling loop is removed.
- The Chats section has a bottom-right create FAB for direct chats, secret chats, groups and channels.
- Zladen has explicit entries under “More”: open the personal chat and select a compatible group for installation.
- Feed rendering now has one global async entrypoint and one internal DOM renderer. Remote loading errors are surfaced instead of silently appearing as an empty feed.
- Feed cards use a dedicated Reddit-like vote rail while preserving comments, share and save actions.

## Security and data boundaries

- No production schema migration was required for these UI and application-layer changes.
- The live Supabase schema was checked for the channel, message, feed post, profile and feed enrichment projections used in this iteration.
- Public feed rows remain subject to the existing RLS visibility rules.
- E2E protocol, identity keys, prekeys, ratchet state and SDK version were not rewritten.
- Search over message bodies remains restricted to eligible non-E2E conversations; encrypted message content is not sent to server-side plaintext search.
- Channel UI gating is not a substitute for server authorization. RPCs, RLS and database constraints remain the security boundary and must continue to be audited separately.

## Performance assessment

The feed enrichment requests for profiles, source channels, likes, comments, media and saves are issued in parallel. Avatar refresh no longer polls every few seconds. These are sound reductions in avoidable work, but they do not establish a performance target.

There is currently no verified benchmark for:
- cold-start time on a mid-range Android device;
- time to first chat list and first message;
- feed latency under a large dataset;
- memory use during long conversations;
- concurrent Supabase load;
- E2E setup latency with multiple devices.

No performance number should be claimed until those measurements exist.

## Remaining engineering priorities

### Priority 1 — finish the legacy-to-modular migration
Move feed persistence/rendering and the remaining chat-list glue out of `index.html` into dedicated repositories/controllers. Keep the existing public behavior and add tests before removing compatibility paths.

### Priority 2 — security review of dynamic rendering
Review all 29 manually flagged `innerHTML` sites. Prefer DOM construction or a vetted sanitizer for rich content. Add malicious-input tests for usernames, channel names, post text, message previews, attachment names and bot metadata.

### Priority 3 — browser acceptance automation
Add Playwright coverage for:
- login and session restore;
- direct/group/channel list loading;
- user/channel/message search;
- post creation, channel-to-feed forwarding and comments;
- Zladen direct chat and group installation;
- private direct and private group E2E setup;
- switching between conversations with and without avatars;
- navigation section isolation and mobile FAB placement.

### Priority 4 — data contracts and observability
Add runtime validation or JSDoc contracts for Supabase row shapes, structured error codes, correlation IDs and useful user-facing failure states. Avoid catch-and-ignore except for explicitly optional operations.

### Priority 5 — measured performance work
Add Lighthouse/mobile profiling, database query plans for the most common list queries, realistic data-volume tests and a repeatable relay benchmark. Optimize measured bottlenecks rather than shrinking code indiscriminately.

## Final verdict

Iteration 181 repairs several real integration defects and improves ownership boundaries in the touched areas. It does **not** complete the modernization of the entire repository. The correct engineering status is:

- modular foundation: present;
- key bug fixes in this iteration: implemented and covered by regression tests;
- E2E protocol preservation: maintained;
- full legacy retirement: not complete;
- full XSS/security audit: not complete;
- real-device end-to-end acceptance: still required;
- MIT-level quality claim: not justified yet.

The project should continue through controlled refactoring with tests, not a wholesale rewrite or code-size reduction that removes existing capabilities.
