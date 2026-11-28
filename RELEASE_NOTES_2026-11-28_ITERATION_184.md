# RIM 4.1.8 — Iteration 184

## Corrected failures and regressions

### Group creation through the floating plus menu
- The previous implementation created a conversation without recording `created_by` and inserted the creator with the ordinary `member` role. The subsequent privacy/settings update therefore failed its own management check.
- Added `rim_create_group_chat`, an authenticated SECURITY DEFINER RPC that validates the user, title, invitees and avatar path, then creates the group, writes `created_by`, assigns the creator the `owner` role, sets privacy and adds invitees in one transaction.
- `GroupCommandService` now calls the atomic RPC and cleans up an uploaded avatar if creation fails.
- Removed the competing prompt-based `newGroupChat` assignment from `ShellSurface`. `GroupsSurface` is the single owner of the group-create route.
- The plus menu now checks that a route exists and reports missing module handlers instead of silently doing nothing.
- New-group dialog offers Zladen as a default participant. His username is checked against the profiles table before inclusion, so a missing bot profile does not block group creation.
- Channel creation reports an unavailable modal runtime instead of silently returning.
- Added `rim_create_channel`, which creates the channel and owner-admin membership in one transaction. Public channels become catalog-visible; private channels do not.
- Both new RPCs use SECURITY INVOKER with narrowly scoped RLS. Group invite inserts require the creator to still hold owner membership. The old prompt-based ComposeChatService group path now calls the same atomic RPC; the old SECURITY DEFINER `create_group_chat` RPC is revoked from authenticated clients.

### Feed publishing
- The publisher has an in-flight guard and disables the publish button while a post is being sent.
- Supabase insert errors are preserved and shown to the user rather than being reduced to a generic message.
- Media upload, metadata, path-update and signed-URL failures now record actionable error information.
- Authenticated feed writes do not silently fall back to local-only posts.

### Header and search
- Restored the “Римъ” wordmark in the main application header.
- Search remains the rightmost header control.
- The complete header (settings/avatar, wordmark and search) is hidden only while the search page is open, and restored when that page closes.
- Selecting a public group from search closes the search page before joining/opening it.

### Music
- The music surface now renders the local library before waiting for cloud music metadata and signed URLs.
- Cloud hydration happens asynchronously and cannot leave the music tab blank while a remote request is pending.
- A visible loading state appears before local IndexedDB initialization completes.

### Chat information and E2E
- Chat information now resolves the active conversation from the canonical legacy context if the window mirror is stale.
- Every direct chat exposes an E2E action.
- For an ordinary direct chat, the action creates a separate secret E2E conversation with the other participant. It does not silently convert old plaintext history into encrypted history.
- Existing secret direct chats continue to expose verification/completion; private groups retain their group E2E control.

### Zladen games, RP and help
- Added `/dice` as an alias for `/roll`, plus `/golden_dice`, `/pair_all` and `/ping`.
- Added group RP actions `/hug`, `/pat` and `/tea` alongside high-five, handshake, congratulations, praise and apology.
- Extended `/help <command>` descriptions to cover games, RP actions and market operations.
- Executed transactional group-message tests with Zladen installed: golden dice, help descriptions, random pairing, hug and dice alias all produced the expected bot replies; test rows were rolled back.

### Channel moderation metadata
- Production logs contained a `42501 permission denied` when channel moderation metadata was read.
- Added a SELECT grant to authenticated users plus an RLS policy scoped to `app_can_manage_channel(channel_id)`.
- The existing restrictive seed-session gate remains in force; anon receives no SELECT grant.

## Database migrations applied to production Supabase
- `20261128063856_rim_iteration_184_atomic_group_creation`
- `20261128121000_rim_iteration_184_channel_moderation_read_policy`
- `20261128122000_rim_iteration_184_atomic_channel_creation`
- `20261128124000_rim_iteration_184_invoker_create_rpc_rls`
- `20261128124500_rim_iteration_184_creator_scoped_member_insert`
- `20261128125000_rim_iteration_184_creator_member_insert_guard`
- `20261128130000_rim_iteration_184_zladen_social_game_commands`

## Database-level acceptance checks
Executed under the `authenticated` role inside transactions and rolled back:
- Feed post INSERT into `feed_posts`: passed.
- Private channel INSERT into `channels`: passed.
- Group RPC returned a group with `created_by = auth.uid()`, `is_private = false`, and creator role `owner`: passed.
- Channel owner membership INSERT with role `admin`: passed.
- Moderation metadata grants: authenticated SELECT true; anon SELECT false.
- The production help trigger remains ordered after the message validation, encryption, block and moderation guards.

## Important limits
- A database-level feed insert is not the same as a full Android UI acceptance test with the user's active session. The updated client now surfaces the exact backend error if the UI path still fails.
- Actual audio playback, Telegram OAuth, two-device E2E exchange and the full create/search/feed flows still require real-device acceptance.
- This release does not claim complete Iris parity. Zladen retains and improves its existing moderation, triggers, economy, games, polls, reminders, clans, aliases and custom commands. The documented missing areas remain: cross-chat networks, community directory/geography, full social graph and relationship system, VIP/Business parity, complete Iris clone bots and full command/data compatibility.
- The 24 legacy scripts remain as a compatibility archive because multiple regression contracts still inspect them. They are not loaded by the current `index.html`. This iteration removes a duplicate global creation route but does not delete the archive before a complete feature migration.

