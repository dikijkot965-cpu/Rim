import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('music renders a visible loading state and local tracks before cloud hydration', async () => {
  const source = await readFile(new URL('../src/features/local-music.js', import.meta.url), 'utf8');
  const start = source.indexOf('  async render() {');
  const end = source.indexOf('  renderTracks(all, sequence)', start);
  assert.ok(start >= 0 && end > start);
  const render = source.slice(start, end);
  assert.match(render, /rim-music-loading/);
  assert.match(render, /const localTracks = await this\.all\(\)/);
  assert.ok(render.indexOf('this.renderTracks(localTracks, sequence)') < render.indexOf('this.remoteTracks()'));
  assert.doesNotMatch(render, /await this\.allMerged\(\)/);
});

test('cloud music failures do not replace the already rendered local library', async () => {
  const source = await readFile(new URL('../src/features/local-music.js', import.meta.url), 'utf8');
  const start = source.indexOf('  async render() {');
  const end = source.indexOf('  renderTracks(all, sequence)', start);
  const render = source.slice(start, end);
  assert.match(render, /void this\.remoteTracks\(\)\.then/);
  assert.match(render, /music\.cloud\.refresh\.failed/);
});
