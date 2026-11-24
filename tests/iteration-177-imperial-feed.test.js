import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261124094152_rim_iteration_177_imperial_controls.sql', import.meta.url), 'utf8');
const gamesMigration = await readFile(new URL('../supabase/migrations/20261124094718_rim_iteration_177_zladen_social_games.sql', import.meta.url), 'utf8');

test('feed composer supports inline placement and multiple attachments', () => {
  assert.match(html, /id="rimFeedImageInput"[^>]*multiple/);
  assert.match(html, /id="rimFeedFileInput"[^>]*multiple/);
  assert.match(html, /📎 Вложение \$\{index \+ 1\}/);
  assert.match(html, /renderFeedBodyWithMedia/);
  assert.match(html, /mediaItems: signedMedia\.map/);
  assert.match(html, /data-feed-compose-topic/);
});

test('feed rendering escapes authored text before applying limited formatting', () => {
  assert.match(html, /escapeHtml\(piece\)\.replace/);
  assert.ok(html.includes("replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')"));
  assert.ok(html.includes("replace(/(^|\\s)_([^_]+)_($|\\s)/g, '$1<em>$2</em>$3')"));
});

test('imperial directory is server-backed and no demo channels are seeded', () => {
  assert.match(html, /rpc\('rim_admin_list_channels'/);
  assert.match(html, /rpc\('rim_admin_list_groups'/);
  assert.match(html, /rim_user_topic_preferences/);
  assert.match(html, /personalizationScore/);
  assert.match(html, /rim_user_feed_events/);
  assert.doesNotMatch(html, /demo_ch_1|u_demo_1|rep_1/);
});

test('channel and group image/video restrictions call privileged RPCs', () => {
  assert.match(html, /rim_admin_set_channel_controls/);
  assert.match(html, /rim_admin_set_conversation_controls/);
  assert.match(migration, /private\.rim_chat_media_upload_allowed/);
  assert.match(migration, /drop policy if exists chat_files_insert_own_folder/);
  assert.match(migration, /chat_files_insert_own_folder on storage\.objects for insert/);
});

test('welcome and admin notices are persisted and sent through database functions', () => {
  assert.match(html, /rim_admin_save_global_welcome/);
  assert.match(html, /rim_admin_send_notice/);
  assert.match(migration, /rim_dispatch_imperial_welcome/);
  assert.match(migration, /rim_imperial_welcome_new_user/);
});

test('imperial controls are restricted to superadmins server-side', () => {
  const matches = migration.match(/role='superadmin'/g) || [];
  assert.ok(matches.length >= 6);
  assert.match(migration, /revoke all on public\.rim_imperial_channel_controls/);
});

test('Zladen safe mini-games are server-side and group-scoped', () => {
  for (const command of ['roll','random','choose','yesno','percent','who','pair','game_stats','game_top','highfive','handshake','congrats','praise','apologize']) assert.ok(gamesMigration.includes("'"+command+"'"));
  assert.match(gamesMigration, /v_group\.type<>'group'/);
  assert.match(gamesMigration, /e2e_mode,'off'\) in \('pending','required'\)/);
});

test('Zladen game history contains only bounded activity metadata and no wallet/stake fields', () => {
  assert.match(gamesMigration, /create table if not exists public\.rim_zladen_game_events/);
  assert.match(gamesMigration, /game_key text not null check/);
  assert.doesNotMatch(gamesMigration, /stake_amount|wager_amount|cash_balance|betting_pool/i);
  assert.match(gamesMigration, /revoke all on public\.rim_zladen_game_events from public,anon,authenticated/);
});

test('Zladen mini-game commands cannot execute in E2E pending or required scopes', () => {
  assert.match(gamesMigration, /e2e_mode,'off'\) in \('pending','required'\)/);
  assert.match(gamesMigration, /on conflict\(sender_id,client_message_id\) do nothing/);
});
