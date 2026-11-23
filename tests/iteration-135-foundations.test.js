import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');

test('iteration 135 SQL pack includes bot projects, files, versions, runtime and owner policies', () => {
  const schema=read('sql/future/01_bot_and_social_feed_schema_reference.sql');
  const runtime=read('sql/future/02_bot_runtime_rpcs.sql');
  for(const table of ['rim_bot_projects','rim_bot_project_files','rim_bot_project_versions','rim_bot_runtime_state','rim_bot_runtime_logs']) assert.match(schema,new RegExp(`create table if not exists public\\.${table}`));
  assert.match(schema,/enable row level security/);
  assert.match(runtime,/private\.rim_user_owns_bot/);
  assert.match(runtime,/rim_bot_request_runtime/);
  assert.match(runtime,/grant execute on function public\.rim_bot_request_runtime\(uuid,text\) to authenticated/);
});

test('social schema supports post discovery, media, moderation, personalization and localization keys', () => {
  const schema=read('sql/future/01_bot_and_social_feed_schema_reference.sql');
  for(const table of ['rim_feed_topics','rim_feed_post_topics','rim_feed_post_media','rim_feed_post_saves','rim_feed_post_views','rim_feed_post_reactions','rim_feed_post_reposts','rim_feed_post_reports','rim_feed_post_drafts','rim_feed_post_schedule','rim_feed_hashtags','rim_feed_post_hashtags','rim_feed_post_mentions','rim_user_feed_preferences','rim_user_topic_preferences','rim_user_feed_events','rim_feed_impressions','rim_feed_collections','rim_user_muted_topics','rim_user_muted_authors','rim_user_profile_preferences']) assert.match(schema,new RegExp(`create table if not exists public\\.${table}`));
  assert.match(schema,/name_key text not null/);
  assert.match(schema,/personalization_enabled boolean not null default true/);
  assert.match(read('docs/SOCIAL_FEED_SCHEMA.md'),/Do not infer or store sensitive traits/);
  const advanced=read('sql/future/04_advanced_feed_features.sql');
  for(const table of ['rim_feed_comment_reactions','rim_feed_post_polls','rim_feed_poll_options','rim_feed_poll_votes','rim_feed_post_revisions','rim_feed_post_collaborators','rim_feed_moderation_queue','rim_feed_ranking_config','rim_feed_recommendation_cache','rim_feed_topic_follows','rim_feed_post_suppressions','rim_feed_author_stats']) assert.match(advanced,new RegExp(`create table if not exists public\\.${table}`));
  assert.match(advanced,/rim_feed_validate_poll_vote/);
});

test('E2E device directory keeps private keys local and atomically consumes one-time prekeys', () => {
  const schema=read('sql/future/03_e2e_device_registry.sql');
  const vault=read('src/security/e2e/identity-vault.js');
  const repository=read('src/infrastructure/supabase/e2e-device-repository.js');
  assert.match(schema,/for update skip locked/);
  assert.match(schema,/user_blocks/);
  assert.match(schema,/revoke all on function public\.rim_e2e_claim_prekey_bundle/);
  assert.match(vault,/non-extractable|CryptoKeys/);
  assert.match(repository,/verifySignedPrekey/);
  assert.match(read('docs/E2E_IMPLEMENTATION_DECISION.md'),/not enabled in the message send\/read path/);
});
