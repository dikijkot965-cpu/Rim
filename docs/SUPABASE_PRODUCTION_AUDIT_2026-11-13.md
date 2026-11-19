# Supabase production audit — 2026-11-13

Target: project `Императорский Мессенджер` (`xxvcsaomkyknudoaixbs`, eu-west-1). The similarly named project `Русский Императорский Мессенджер` is a separate, inactive project and was not used.

The audit was read-only. No SQL, migration, policy, key, Auth setting, or production data was changed.

## Existing foundations confirmed

- Project status: ACTIVE_HEALTHY; PostgreSQL 17.11.
- The public schema already contains the main messaging entities (`profiles`, `conversations`, `conversation_members`, `chat_messages`, `message_reactions`) and extensive feature tables for channels, reports, notifications, RIM ID, favorites, writer documents, drafts, folders, polls, voice messages and other features.
- RLS is enabled on the inspected public tables.
- `chat_messages` already has a composite index on `(conversation_id, created_at DESC, id DESC)`, which supports the new timeline query pattern.
- The current message policies include member-read/member-send and author-update/author-delete policy families. The UI uses the existing authenticated Supabase client and does not receive a service-role key.

## Supabase Advisor findings

### Security

- 6 tables have RLS enabled but no policies: `channel_discussion_sync`, `channel_member_moderation`, `rim_id_access_tokens`, `rim_id_authorization_codes`, `rim_id_refresh_tokens`, `rim_id_signing_keys`. No policy means access is denied by default; for the RIM ID token/signing-key tables this may be intentional, but the server-side token flow must be verified before changing it.
- 25 `SECURITY DEFINER` functions are executable by `anon`; 53 are executable by `authenticated`. This is an elevated review priority. Some functions may be intentionally callable RPCs, while trigger functions should generally not be directly executable by API roles. Each function body, `search_path`, authorization checks, and required callers must be reviewed individually before revoking grants.
- Auth leaked-password protection is reported as not enabled.

### Performance

- 136 RLS policies re-evaluate `auth.*` / `current_setting()` per row; Supabase recommends wrapping stable auth calls as `(select auth.uid())` where semantics allow.
- 52 foreign keys lack covering indexes.
- 47 cases of multiple permissive policies exist.
- 5 duplicate-index pairs are reported.
- 48 indexes are reported unused. Do not drop them solely from this snapshot: the project may have low traffic or indexes may serve infrequent administrative queries.

## Required next DB work

1. Export definitions for all flagged `SECURITY DEFINER` functions and inspect them in groups by purpose (RPC, trigger, helper).
2. For each function, document intended roles and whether anonymous execution is needed; then prepare a reviewed grant migration. Do not bulk-revoke every function because that can break trigger/RPC paths.
3. Verify RIM ID authorization-code, access-token, refresh-token, and signing-key access is restricted to trusted server-side functions. Do not create broad client policies for these tables.
4. Review `channel_discussion_sync` and `channel_member_moderation` call paths; add narrowly scoped policies only if direct authenticated access is a real requirement.
5. Prioritize message/member and notification FK indexes using real query plans and workload data; avoid mass index changes without `EXPLAIN (ANALYZE, BUFFERS)` on staging.
6. Enable leaked-password protection after checking the project's Auth configuration and rollout impact.

## Why the database was not modified here

The advisor findings include dozens of privileged functions and security policies. A blanket automated change could either expose token/signing material or break core group/channel/RIM ID operations. The safe action in this iteration was to preserve the live database, record the exact audit findings, and make the frontend message query align with the already-existing composite index.
