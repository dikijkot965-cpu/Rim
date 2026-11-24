import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const migration = readFileSync(new URL('supabase/migrations/20261124090205_rim_iteration_176_feed_media_storage.sql', root), 'utf8');

test('feed media uses a private bucket with explicit MIME and size limits', () => {
  assert.match(migration, /'feed-media',\s*'feed-media',\s*false,\s*26214400/);
  assert.match(migration, /'image\/jpeg'/);
  assert.match(migration, /'video\/mp4'/);
  assert.match(migration, /'application\/pdf'/);
});

test('feed Storage reads are visibility-aware and not public', () => {
  assert.match(migration, /public\.app_can_view_feed_post\(m\.post_id\)/);
  assert.match(migration, /bucket_id = 'feed-media'/);
  assert.doesNotMatch(migration, /create policy[^;]*to anon/i);
});

test('feed uploads store metadata and use short-lived signed URLs', () => {
  assert.match(html, /async function sbUploadFeedMedia\(postId, file\)/);
  assert.match(html, /from\('rim_feed_post_media'\)\.insert/);
  assert.match(html, /createSignedUrl\(path, 1800\)/);
  assert.match(html, /createSignedUrls\(paths, 1800\)/);
});

test('feed supports media-only remote posts and saved-post mode', () => {
  assert.match(html, /if \(!text && !file\)/);
  assert.match(html, /data-feed-mode="saved"/);
  assert.match(html, /mode === 'saved'/);
  assert.match(html, /sbToggleFeedSave/);
});

test('feed does not persist a browser data URL as the remote media path', () => {
  const start = html.indexOf('async function sbUploadFeedMedia(postId, file)');
  const end = html.indexOf('async function sbListComments', start);
  const upload = html.slice(start, end);
  assert.doesNotMatch(upload, /readAsDataURL|data:image\//);
});
