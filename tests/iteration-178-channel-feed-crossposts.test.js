import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const [html,controller,migration,app,messageService,zladenConsole,zladenFilters,zladenFilterFix]=await Promise.all([
 readFile(new URL('index.html',root),'utf8'),
 readFile(new URL('src/application/channel-feed-controller.js',root),'utf8'),
 readFile(new URL('supabase/migrations/20261124102503_rim_iteration_178_channel_feed_crossposts.sql',root),'utf8'),
 readFile(new URL('src/app.js',root),'utf8'),
 readFile(new URL('src/application/message-command-service.js',root),'utf8'),
 readFile(new URL('src/application/zladen-group-console-controller.js',root),'utf8'),
 readFile(new URL('supabase/migrations/20261124103001_rim_iteration_178_zladen_content_filters.sql',root),'utf8'),
 readFile(new URL('supabase/migrations/20261124103102_rim_iteration_178_zladen_filter_hardening.sql',root),'utf8')
]);
test('channel composer persists the dual destination preference and mirrors after successful channel insert',()=>{
 assert.match(controller,/id="rimChannelAlsoToFeed"/);assert.match(controller,/rimSetChannelFeedPref/);assert.match(controller,/mirrorToFeed/);assert.match(controller,/rimPublishChannelPostToFeed/);assert.match(html,/rimGetChannelFeedPref/);assert.match(html,/channelFeedPrefKey\(\).*rimUserId/);
});
test('existing public-channel posts expose a manager action to add them to the home feed',()=>{
 assert.match(controller,/data-rim-cf-action="to-feed"/);assert.match(controller,/case 'to-feed'/);assert.match(controller,/publishPostToHomeFeed/);assert.match(controller,/state\?\.manager/);
});
test('cross-posting copies source image to feed-media and rejects private or E2E channels',()=>{
 assert.match(html,/async function sbPublishChannelPostToFeed/);assert.match(html,/channel\.is_public!==true/);assert.match(html,/channel\.e2e_mode==='required'/);assert.match(html,/storage\.from\('chat-files'\)\.createSignedUrl/);assert.match(html,/sbUploadFeedMedia\(remote\.id/);
});
test('database cross-post source is unique and validated server-side',()=>{
 assert.match(migration,/source_channel_id uuid/);assert.match(migration,/source_channel_post_id uuid/);assert.match(migration,/feed_posts_source_channel_post_unique/);assert.match(migration,/v_is_public is not true/);assert.match(migration,/feed_channel_source_manager_required/);assert.match(migration,/channel_posts p/);
});
test('home feed composer autosaves and restores per-account text and topics',()=>{
 assert.match(html,/FEED_DRAFT_KEY='rim_feed_draft_v2'/);assert.match(html,/function feedDraftStorageKey\(\)\{return FEED_DRAFT_KEY\+':'\+\(rimUserId\(\)\|\|'guest'\);\}/);assert.match(html,/function saveFeedDraft/);assert.match(html,/function restoreFeedDraft/);assert.match(html,/function clearFeedDraft/);assert.match(html,/addEventListener\('input',saveFeedDraft\)/);
});
test('E2E stays wired to RIM relay and required scopes do not fall through to plaintext',()=>{
 assert.match(app,/new SupabaseSignalProtocolRelay/);assert.match(app,/isScopeVerified: scope => e2eSignalRuntime\.isScopeVerified\(scope\)/);assert.match(messageService,/e2eRuntime\.sendDirect/);assert.match(messageService,/never fall through to plaintext/);assert.match(app,/startE2ERuntimeForProtectedConversation/);
});
test('Zladen exposes configurable link and custom-word filters in group console',()=>{
 assert.match(zladenConsole,/Фильтры: состояние/);assert.match(zladenConsole,/Запретить ссылки/);assert.match(zladenConsole,/Список фильтров/);assert.match(zladenFilters,/rim_zladen_filter_settings/);assert.match(zladenFilters,/links_enabled/);assert.match(zladenFilters,/blocked_terms/);assert.match(zladenFilters,/content_filter_block/);
});
test('Zladen filters exclude E2E pending/required scopes and use a server-side insert trigger',()=>{
 assert.match(zladenFilters,/v_group\.type<>'group'/);assert.match(zladenFilters,/e2e_mode,'off'\) in \('pending','required'\)/);assert.match(zladenFilters,/before insert on public\.chat_messages/);assert.match(zladenFilters,/return null/);assert.match(zladenFilters,/revoke all on public\.rim_zladen_filter_settings from public,anon,authenticated,service_role/);
});
test('Zladen link filter uses literal-dot matching and custom phrase cap',()=>{
 assert.match(zladenFilterFix,/www\[\.\]\|t\[\.\]me/);assert.match(zladenFilterFix,/v_count:=cardinality/);assert.match(zladenFilterFix,/Достигнут лимит 50 фраз/);
});
