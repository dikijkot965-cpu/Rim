import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateMusicUpload, validateMusicTitle } from '../src/domain/music-track.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('music domain rejects empty title and huge files', () => {
  assert.equal(validateMusicTitle('').ok, false);
  assert.equal(validateMusicUpload('Track', { type: 'audio/mpeg', size: 100, name: 'a.mp3' }).ok, true);
  assert.equal(validateMusicUpload('Track', { type: 'audio/mpeg', size: 30 * 1024 * 1024, name: 'a.mp3' }).ok, false);
});

test('bootstrap music and chat-info are ownership stubs', () => {
  const boot = readFileSync(join(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8');
  assert.match(boot, /__RIM_MUSIC_OWNED/);
  assert.match(boot, /__RIM_CHAT_INFO_OWNED/);
  assert.match(boot, /__RIM_SESSION_LIFECYCLE_OWNED/);
  assert.doesNotMatch(boot, /from\("music_tracks"\)\.insert/);
  const lines = boot.split(/\n/).length;
  assert.ok(lines < 300, `bootstrap lines ${lines}`);
});

test('features surface owns music routes', () => {
  const surface = readFileSync(join(root, 'src/composition/features-surface.js'), 'utf8');
  assert.match(surface, /__RIM_MUSIC_OWNED/);
  assert.match(surface, /win\.loadMusic/);
  assert.match(surface, /win\.uploadMusic/);
});
