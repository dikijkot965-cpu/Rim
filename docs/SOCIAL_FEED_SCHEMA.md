# RIM social feed schema foundation

Iteration 135 adds an additive schema foundation for the planned news/posts feed. Existing `feed_posts`, likes, comments, follows, blocks, and profile tables remain in place.

## Content model

- `feed_posts`: extended with title, content format, language code, topic ids, publication time, edit version, pin state, content labels, and soft-delete timestamp.
- `rim_feed_topics`: taxonomy uses localization keys (`name_key`, `description_key`) instead of hard-coded Russian labels.
- `rim_feed_post_topics`: post/topic relationships and classification provenance.
- `rim_feed_post_media`: ordered media metadata; binary objects remain in Supabase Storage.
- `rim_feed_hashtags`, `rim_feed_post_hashtags`, `rim_feed_post_mentions`: discovery metadata.
- `rim_feed_post_saves`, `rim_feed_post_reactions`, `rim_feed_post_reposts`, `rim_feed_post_reports`: interaction layer.
- `rim_feed_post_views`: view and dwell-time measurements. Anonymous views must use a one-way hashed key, never raw IP or fingerprint.
- `rim_feed_post_drafts`, `rim_feed_post_schedule`: drafts and future publishing queue.
- `rim_feed_comment_reactions`, `rim_feed_post_polls`, `rim_feed_poll_options`, `rim_feed_poll_votes`: threaded comments/reactions and polls with single-choice validation.
- `rim_feed_post_revisions`, `rim_feed_post_collaborators`: revision history and future collaborative authoring.
- `rim_feed_moderation_queue`, `rim_feed_ranking_config`, `rim_feed_recommendation_cache`: server-maintained moderation/ranking infrastructure.
- `rim_feed_topic_follows`, `rim_feed_post_suppressions`, `rim_feed_author_stats`: followed topics, explicit “not interested” suppression, and aggregate author metrics.

## Personalization model

- `rim_user_feed_preferences`: mode, languages, autoplay, sensitive-content preference, repost visibility, personalization opt-out.
- `rim_user_topic_preferences`: explicit/implicit topic weights in the range -100..100.
- `rim_user_feed_events`: bounded behavioral events used to improve ranking.
- `rim_feed_impressions`: records what was actually shown and at which position.
- `rim_feed_collections`, `rim_feed_collection_items`: user-curated collections.
- `rim_user_muted_topics`, `rim_user_muted_authors`: explicit negative preferences.
- `rim_user_profile_preferences`: theme, locale, timezone, date/number format, accessibility and interface preference JSON.

## Privacy and ranking rules

- Personalization can be disabled per user; the chronological/following modes must remain available.
- Do not infer or store sensitive traits (health, religion, ethnicity, political affiliation, sexuality, etc.) for ranking.
- Do not use raw IP addresses, contact lists, or device fingerprinting as recommendation features.
- Events should have retention/aggregation policies. Raw impression events should not be kept forever.
- Every feed query must apply author visibility, block/mute, moderation, deletion, and language/topic preferences before ranking.
- The ranking algorithm must not let engagement override safety/moderation or user opt-outs.

## What is not implemented

This is a database foundation, not a finished feed product. Ranking, candidate generation, moderation pipeline, scheduled publishing worker, hashtag indexing triggers, media processing, and UI integration are future work.
