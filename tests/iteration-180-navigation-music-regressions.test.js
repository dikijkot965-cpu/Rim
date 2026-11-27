import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('channel projection never requests the non-existent channels.type column', async () => {
  const source = await read('../src/infrastructure/supabase/conversation-repository.js');
  const match = source.match(/from\('channels'\)\s*\.select\('([^']+)'\)/);
  assert.ok(match, 'channel projection query must exist');
  assert.equal(match[1].split(',').includes('type'), false);
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
