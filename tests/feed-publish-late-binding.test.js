import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('feed publish click resolves the current publisher after the Supabase override', () => {
  assert.match(html, /rimFeedPublishBtn[^\n]*addEventListener\('click',\s*\(\)\s*=>\s*\{\s*void publishFeedPost\(\);\s*\}\)/);
  assert.doesNotMatch(html, /rimFeedPublishBtn[^\n]*addEventListener\('click',\s*publishFeedPost\)/);
});

test('feed publishing prevents duplicate concurrent submissions and surfaces the real backend error', () => {
  assert.match(html, /window\.__RIM_FEED_PUBLISHING/);
  assert.match(html, /publishButton\.disabled = true/);
  assert.match(html, /window\.__RIM_FEED_LAST_ERROR/);
  assert.match(html, /Публикация не создана:/);
  assert.match(html, /finally\s*\{[\s\S]{0,180}publishButton\.disabled = false/);
});
