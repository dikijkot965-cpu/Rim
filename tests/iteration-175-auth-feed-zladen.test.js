import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(resolve(root, 'index.html'), 'utf8');
const runtime = readFileSync(resolve(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

function between(source, start, end) {
  const a = source.indexOf(start);
  assert.notEqual(a, -1, `missing source anchor: ${start}`);
  const b = source.indexOf(end, a + start.length);
  assert.notEqual(b, -1, `missing source end anchor: ${end}`);
  return source.slice(a, b);
}

test('Iteration 175 package version is consistent', () => {
  assert.equal(packageJson.version, '4.1.8-iteration.175');
});

test('Telegram login has a callable OIDC PKCE handler and validates callback state', () => {
  assert.match(runtime, /window\.signInWithTelegram\s*=\s*signInWithTelegram/);
  assert.match(runtime, /code_challenge_method:\s*'S256'/);
  assert.match(runtime, /stored\.state\s*!==\s*callback\.state/);
  assert.match(runtime, /verifyOtp\(\{[\s\S]*type:\s*'magiclink'/);
  assert.match(runtime, /db\.functions\.invoke\('telegram-auth'/);
});

test('a missing modular bundle cannot leave authentication blocked forever', () => {
  assert.match(runtime, /window\.__RIM_APP_MODULES_READY_STATE\s*=\s*'fallback'/);
  assert.match(runtime, /window\.__RIM_APP_BOOTSTRAP_FALLBACK\s*=\s*true/);
  assert.match(runtime, /waitForRimAppModulesReady\(timeoutMs\s*=\s*5000\)/);
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
  assert.doesNotMatch(listComments, /\\.select\\([^)]*\\b(?:user_id|content|text)\\b/);
  const addComment = between(index, 'async function sbAddComment(postId, text)', 'async function sbListChannels()');
  assert.match(addComment, /post_id: postId, author_id: uid, body: text/);
});

test('authenticated feed writes do not silently fall back to local-only storage', () => {
  assert.match(index, /hasRemoteSession\s*=\s*!!rimDb\(\)\s*&&\s*!!rimUserId\(\)/);
  assert.match(index, /Не удалось опубликовать пост в Supabase/);
  assert.match(index, /Не удалось сохранить комментарий в Supabase/);
});

test('Zladen is installed through the authenticated system-bot Edge Function', () => {
  assert.match(runtime, /db\.functions\.invoke\('rim-zladen',\{body:\{action:'install'\}\}\)/);
  assert.match(runtime, /ensureZladenInstalled\(\)/);
});
