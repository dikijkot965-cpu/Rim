# Legacy inventory

The current release still carries 24 ordered classic scripts under `assets/js/legacy/`. They are retained to avoid silently dropping mature messenger features during a high-risk rewrite. This is an explicit compatibility zone, not a claim that all old code is already clean.

New feature work belongs under `src/`. The migration proceeds feature-by-feature. Iteration 6 moved conversation-list projection responsibilities out of legacy `03`, `16` and `25`. Iteration 7 moved outgoing read-receipt state/ticks out of legacy `25` and `06`; both files remain because they still contain unrelated product functionality.

Do not add another wrapper to the legacy chain. Remove a legacy implementation only after its modular replacement and integration coverage exist. Delete a legacy file only when no required live functions remain.

Iteration 8 moved the channel directory read model and `all` / `subscribed` filter from legacy `17` into `src/application/channel-directory-controller.js` and `src/infrastructure/supabase/channel-repository.js`. Legacy `17` still owns channel join/leave RPC commands, channel moderation/settings and admin utilities; it remains loaded. The modular directory preserves existing list classes and delegates actions to the retained commands.
