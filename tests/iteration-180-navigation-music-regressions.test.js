import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('channel projection never requests the non-existent channels.type column', async () => {
  const source = await read('../src/infrastructure/supabase/conversation-repository.js');
  const projections = [...source.matchAll(/from\('channels'\)\s*\.select\('([^']+)'\)/g)]
    .map(match => match[1]);
  const channelProjection = projections.find(columns => columns.startsWith('id,title,'));
  assert.ok(channelProjection, 'channel list projection query must exist');
  assert.equal(channelProjection.split(',').includes('type'), false);
  assert.match(source, /type:\s*'channel'/);
});

test('secondary navigation explicitly hides the feed section', async () => {
  const source = await read('../src/application/navigation-pages-controller.js');
  const showOnly = source.match(/#showOnly\(sectionId\)\s*\{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.match(showOnly, /feedSection/);
});

test('modular music mount replaces legacy markup and does not render twice on tab click', async () => {
  const source = await read('../src/composition/features-surface.js');
  assert.match(source, /section\.replaceChildren\(music\.root\)/);
  assert.doesNotMatch(source, /musicButton\.addEventListener\('click'/);
  assert.match(source, /NavigationSectionController owns tab switching/);
});

test('legacy music navigation does not invoke its renderer when modular music owns the section', async () => {
  const source = await read('../assets/js/legacy/21-rim-update-discovery-music.js');
  assert.match(source, /name==='music'&&!window\.__RIM_MUSIC_OWNED/);
});

test('feed has an obvious composer and renders channel-origin posts as community cards', async () => {
  const html = await read('../index.html');
  assert.match(html, /id="rimFeedCreatePrompt"/);
  assert.match(html, /rim-feed-post-community/);
  assert.match(html, /rim-feed-post-title/);
  assert.match(html, /source_channel_id,source_channel_post_id/);
  assert.match(html, /fromChannel:\s*!!r\.source_channel_id/);
  assert.match(html, /sourceChannelTitle:\s*sourceChannels/);
  assert.match(html, /from\('channels'\)\.select\('id,title,username'\)/);
  assert.match(html, /data-action="share"/);
});

test('feed has one global renderer with a single remote-refresh owner', async () => {
  const html = await read('../index.html');
  assert.equal((html.match(/window\.renderFeedList\s*=/g) || []).length, 1);
  assert.match(html, /function renderFeedListNow\(\)/);
  assert.match(html, /const _renderFeedListWindow = renderFeedListNow/);
  assert.match(html, /window\.renderFeedList = async function\(\)/);
  assert.doesNotMatch(html, /window\.__rimFeedRankReady/);
});
