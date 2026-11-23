# RIM SQL reference pack

These scripts document the additive database foundation created in iteration 135. The corresponding schema has already been applied to the connected Supabase project through the managed migration tool. They are supplied so another developer can inspect and reproduce the design without requiring direct access to the live project.

Suggested order for a fresh project after the existing RIM baseline migrations:

1. `01_bot_and_social_feed_schema_reference.sql`
2. `02_bot_runtime_rpcs.sql`
3. `03_e2e_device_registry.sql`
4. `04_advanced_feed_features.sql`

The actual production project received the same schema in smaller migrations and an additional owner-policy hardening migration. Scripts are idempotent for tables/indexes and drop/recreate named policies where appropriate, but they are not a replacement for reviewing the full RIM baseline migrations. Do not apply to an unrelated database.

The live project currently has 28 `rim_feed_*` tables, 6 `rim_user_*` preference/event tables and 14 topic taxonomy records. The advanced pack adds threaded comments, comment reactions, polls/votes, post revisions, collaboration metadata, moderation queue, ranking configuration, recommendation cache, topic follows, suppressions and aggregate author stats.

The feed taxonomy uses localization keys; localized display strings belong in client dictionaries, not in the SQL table. Personalization stores explicit topic preferences and bounded interaction events. Do not add sensitive personal attributes to recommendation features.
