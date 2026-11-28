import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('feed publish click resolves the current publisher after the Supabase override', () => {
  assert.match(html, /rimFeedPublishBtn[^\n]*addEventListener\('click',\s*\(\)\s*=>\s*\{\s*void publishFeedPost\(\);\s*\}\)/);
  assert.doesNotMatch(html, /rimFeedPublishBtn[^\n]*addEventListener\('click',\s*publishFeedPost\)/);
});
