# RIM 4.1.8 — Iteration 183

## Changes

### Groups and channels
- Replaced the nonexistent `create_public_group_chat` client call with the production `create_group_chat` RPC.
- Applies group visibility and avatar through `rim_group_update_settings`.
- Removed the unsupported group username field instead of accepting data that the database could not persist.
- Added authenticated discovery of public group metadata only.
- Added `rim_group_join_public(uuid)`: idempotent membership, public-only, rejects E2E-pending/required groups and users banned from the group.
- Existing channel creation retains owner-membership rollback and MIME/size validation.

### Feed and search
- Fixed late binding of the feed publisher. The publish button now invokes the Supabase-backed implementation rather than the old local-only handler captured at startup.
- Search result click handling is delegated from the results container. Users, channels, conversations and public groups can be opened from search.
- The “Римъ” decorative wordmark is removed from the main application chrome; auth branding remains.

### Profile and settings
- Added a “Мой профиль” entry to Settings.
- Profile editor supports display name, username, bio, name color and avatar as before.
- Added birth date to a separate `profile_private_details` table with RLS restricted to `auth.uid()`. Birth date is not stored in the publicly readable `profiles` table.
- Rejects malformed, pre-1900 and future dates.

### Chat and E2E
- Removed false chat-module loading notifications from modular bootstrap placeholders.
- Added E2E verification action for eligible secret direct chats.
- Existing group E2E activation remains available for private groups.
- E2E-required, pending and secret chats are excluded from the new Zladen help trigger.

### Zladen
- Added command-specific `/help <command>` replies.
- Help resolves built-in commands, group custom commands and aliases. The help trigger runs after encryption, block and moderation guards.
- Expanded the group console quick-command presets with short explanations.
- Existing moderation, games, economy, triggers, reminders, polls, clans, notes, bookmarks, reports and alias/custom-command systems remain in place.

### Music
- A music render failure now displays a visible error message and retry control instead of silently leaving a blank screen. This improves failure visibility; it does not replace real-device audio playback acceptance.

## Supabase migrations applied
- `20261128053459_rim_iteration_183_zladen_help_details`
- `20261128053725_rim_iteration_183_public_group_discovery_join`
- `20261128053821_rim_iteration_183_private_profile_details`
- `20261128054228_rim_iteration_183_zladen_help_secret_scope_guard`
- `20261128054727_rim_iteration_183_zladen_help_after_message_guards`

## Verification
- GitHub verification passed on `bc60adcef81f9caf970c78ffeb8c4950db7bf018`.
- Final build/package workflow runs on the final release commit.
- Unit tests and build checks do not prove live two-device E2E exchange, Telegram OAuth, actual audio playback, or complete Android UI acceptance.
