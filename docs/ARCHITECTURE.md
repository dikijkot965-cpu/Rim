# RIM 2.1 — architecture and operating model

## Honest status

This release introduces a clean, dependency-injected application core and moves new functionality into explicit modules. The historic messenger remains behind `assets/js/legacy/` as a compatibility boundary. It has not yet been fully rewritten: the legacy scripts still contain global functions and historical function replacement. Do not mistake the new folder structure for a completed strangler migration.

## Layers

- `src/core/`: Result values, domain errors, event bus, dependency container, structured logger and health registry. No Supabase or DOM business rules.
- `src/domain/`: pure rules and conversation title policy.
- `src/application/`: use cases orchestrating domain and repositories.
- `src/infrastructure/supabase/`: database adapters. RLS remains the authorization boundary.
- `src/features/`: feature-level UI modules (Favorites and local music).
- `src/compatibility/`: the only intended bridge to the old global application.
- `assets/js/legacy/`: frozen compatibility surface to be migrated incrementally. New features must not be added here.

## Dependency direction

`features/application -> domain` and `infrastructure -> domain contracts`. Domain code must not import DOM, Supabase, or legacy globals. Composition and dependency injection happen in `src/app.js`.

## Configuration and secrets

The browser contains only the Supabase publishable key. Never put `service_role` or a secret key into this static application. Browser environment variables are not secret. Privileged operations belong in Edge Functions or another trusted server environment. Authorization must be enforced by RLS/server-side checks, not UI checks.

## Error handling and observability

- Supabase adapters return explicit `{ ok, value }` / `{ ok, error }` results.
- Unexpected errors are normalized to `RimError` at boundaries.
- Logger events carry timestamp, app version and correlation ID.
- `window.RIM.diagnostics()` runs lightweight Supabase Data API and IndexedDB health checks. It is not a complete infrastructure health check.

## Performance rules

1. Paginate all potentially unbounded reads. Never fetch full message history for a chat view.
2. Query only required columns; avoid `select('*')` on high-volume tables.
3. Batch profile and attachment lookups; never perform one query per message.
4. Realtime subscriptions must be scoped to the current user's conversations and disposed when context changes.
5. Use cursor pagination `(created_at, id)` for message history.
6. Keep static assets on a CDN and enable immutable caching for hashed assets.
7. Use server-side aggregation for analytics; do not count large histories in the browser.

## 100,000 users: what this means

100,000 registered accounts and 100,000 simultaneous active connections are very different capacity targets. This code is stateless at the application boundary and is a better base for horizontal scaling, but this release does **not** certify 100,000 concurrent users. That requires a production Supabase plan and capacity review, realistic workload modelling, connection/Realtime quotas, RLS query plans, storage egress analysis, rate limits, monitoring, and load tests against a staging project. Do not run a 100k-user load test against production.

Before claiming a capacity number, test at least these independent workloads: authenticated sign-in bursts, active Realtime sockets, messages/sec, concurrent channel reads, media uploads/egress, and database p95/p99 latency. Establish target SLOs first. The current frontend cannot manufacture backend capacity by itself.

## Legacy migration plan

1. Characterize existing behavior with browser tests before changing a legacy feature.
2. Move one bounded vertical slice at a time (repository + use case + UI) into `src/`.
3. Add a compatibility adapter only at the boundary; do not create another wrapper chain.
4. Remove the legacy implementation only after tests prove feature parity.
5. Do not merge new features into `assets/js/legacy/`.

## Definition of Done

- Unit and characterization tests pass.
- No unhandled promise rejections in smoke tests.
- No missing local assets or syntax errors.
- RLS and storage policies are reviewed for any touched data path.
- Pagination, retry/timeout behavior and error messages are tested.
- Mobile viewport and keyboard interaction are tested.
- Load test is run in staging and report includes p50/p95/p99, error rate and saturation points.
- Rollback artifact is available.


## Runtime modernization increment 3.1

- `src/application/conversation-list-controller.js` owns the projection of resolved peer identity into the existing legacy chat-list DOM. Profile resolution is batched; avatar work is concurrent and stale renders are discarded.
- `src/application/legacy-entrypoint-registry.js` is the single registry for compatibility wrappers installed by the modular runtime.
- `src/core/disposable-scope.js` owns observers and event listeners and provides deterministic teardown through `window.RIM.dispose()`.
- `src/features/lite-writer.js` serializes autosaves while resolving a server-generated document ID at execution time, preventing duplicate inserts from rapid queued autosaves.

The classic feature implementations are still loaded for compatibility. The migration process must continue by vertical feature slices with browser characterization tests; this increment is not the final removal of the legacy runtime.

## Runtime modernization increment 4.0.0 — iteration 8

- `src/application/channel-directory-controller.js` owns channel directory rendering, membership-based subscription filtering, stale-request protection and delegated list actions.
- `src/infrastructure/supabase/channel-repository.js` owns the read-only channel-directory query and selects only the fields used by the list.
- Legacy `17` retains channel mutations, moderation/settings and admin utilities; only its directory query/filter/render slice was retired. No legacy file was deleted.


## Runtime modernization increment 4.0.0 — iteration 14

The architecture inventory is maintained in `RIM_MODULE_MAP.json` and is checked against the actual `src/` tree by `npm run check`. Every source module must be assigned to exactly one layer. The project checker also enforces selected dependency-direction rules and checks local assets referenced by `index.html`.

Current modular responsibilities include conversation list/state, message commands/timeline, read receipts, channel directory/feed/settings, group settings, favorites, Lite Writer and local music. The 24 classic scripts remain a compatibility runtime; their continued presence is intentional until their individual responsibilities have been migrated and tested.

The checker is an architectural guardrail, not a substitute for code review, browser tests, Supabase RLS review or load testing.


## Runtime modernization increment 4.0.0 — iteration 15

- `src/application/conversation-open-coordinator.js` owns the asynchronous lifecycle surrounding the legacy chat opener: pre-navigation cleanup, latest-request cancellation before the opener starts, and latest-request-only post-open side effects.
- `src/app.js` delegates the compatibility entry point to this coordinator. The legacy opener remains responsible for its existing DOM/rendering work; this iteration does not claim to have migrated the full chat-opening implementation.
- The coordinator preserves the original receiver, arguments and return value, and has explicit lifecycle disposal. Five unit tests cover ordering, rapid switching, stale preflight cancellation, failure handling and disposal.
- The coordinator cannot undo state mutations already performed by an older legacy opener that was already in flight when a newer navigation began. Browser-level characterization and migration of the legacy opener's internal responsibilities remain required.

## Runtime modernization increment 4.0.0 — iteration 17

- `src/application/conversation-navigation-controller.js` now owns the active-conversation selection commit and reply-target reset. It issues request tokens, rejects stale commits and validates that the committed conversation ID matches the requested one. The principal legacy opener retains the existing DOM/rendering sequence but no longer writes active conversation state directly when the modular runtime is available.
- The existing inline compatibility context in `index.html` exposes controlled setter closures for active conversation and reply target; `createLegacyBridge` is the only application-facing access point to those legacy lexical variables.
- `MessageTimelineController` tracks older-page requests per conversation, so an in-flight request from a previous chat does not lock the current chat's history pagination.
- Realtime channel replacement now uses a separate request sequence and rechecks the active conversation after asynchronous channel removal, preventing stale subscription attachment during rapid switching.
- These changes have Node-level unit and static integration coverage. A real browser/device two-account test remains required before further legacy wrapper retirement.
