import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(resolve(root, 'index.html'), 'utf8');
const runtime = readFileSync(resolve(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8');
const bridge = readFileSync(resolve(root, 'assets/js/rim-auth-zladen-bridge.js'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

function between(source, start, end) {
  const a = source.indexOf(start);
  assert.notEqual(a, -1, 'missing source anchor: ' + start);
  const b = source.indexOf(end, a + start.length);
  assert.notEqual(b, -1, 'missing source end anchor: ' + end);
  return source.slice(a, b);
}

test('Iteration 176 retains the Iteration 175 auth/feed integration baseline', () => {
  assert.equal(packageJson.version, '4.1.8-iteration.176');
});

test('Telegram login has a callable OIDC PKCE handler and validates callback state', () => {
  assert.match(bridge, /window\.signInWithTelegram\s*=\s*signInWithTelegram/);
  assert.match(bridge, /code_challenge_method:\s*'S256'/);
  assert.match(bridge, /saved\.state\s*!==\s*callback\.state/);
  assert.match(bridge, /verifyOtp\(\{[\s\S]*type:\s*'magiclink'/);
  assert.match(bridge, /db\.functions\.invoke\('telegram-auth'/);
  assert.match(index, /__RIM_TELEGRAM_OIDC_CALLBACK/);
});

test('authenticated startup waits for the modular entrypoint and loads the auth bridge', () => {
  assert.match(runtime, /__RIM_APP_MODULES_READY_PROMISE/);
  assert.match(runtime, /waitForRimAppModulesReady/);
  assert.match(index, /src="\.\/assets\/js\/rim-app\.bundle\.js"/);
  assert.match(index, /src="\.\/assets\/js\/rim-auth-zladen-bridge\.js"/);
});

test('feed reads only columns present in the deployed feed schema', () => {
  const listPosts = between(index, 'async function sbListFeedPosts(mode)', 'async function sbCreateFeedPost(text)');
  assert.match(listPosts, /\.from\('feed_posts'\)/);
  assert.match(listPosts, /author_id,title,body,media_paths,visibility,comments_enabled,created_at,published_at,deleted_at,is_pinned/);
  assert.doesNotMatch(listPosts, /select\([^)]*\b(?:content|text)\b/);
  assert.match(listPosts, /\.from\('user_follows'\)/);
  assert.match(listPosts, /\.from\('feed_post_likes'\)/);
  assert.match(listPosts, /\.from\('feed_post_comments'\)/);
});

test('feed comments use author_id and body rather than nonexistent aliases', () => {
  const listComments = between(index, 'async function sbListComments(postId)', 'async function sbAddComment(postId, text)');
  assert.match(listComments, /id,post_id,author_id,body,created_at,edited_at,parent_comment_id,deleted_at/);
  assert.doesNotMatch(listComments, /\.select\([^)]*\b(?:user_id|content|text)\b/);
  const addComment = between(index, 'async function sbAddComment(postId, text)', 'async function sbListChannels()');
  assert.match(addComment, /post_id: postId, author_id: uid, body: text/);
});

test('authenticated feed writes do not silently fall back to local-only storage', () => {
  assert.match(index, /hasRemoteSession\s*=\s*!!rimDb\(\)\s*&&\s*!!rimUserId\(\)/);
  assert.match(index, /Не удалось создать публикацию в Supabase/);
  assert.match(index, /Не удалось сохранить комментарий в Supabase/);
});

test('Zladen installs through the authenticated system-bot Edge Function after initialization', () => {
  assert.match(bridge, /db\.functions\.invoke\('rim-zladen', \{ body: \{ action: 'install' \} \}\)/);
  assert.match(bridge, /ensureZladenInstalled\(\)/);
  assert.match(runtime, /__RIM_ZLADEN_AFTER_INIT/);
});
