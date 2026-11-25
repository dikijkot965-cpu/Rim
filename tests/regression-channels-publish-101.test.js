import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test('bootstrap channel load/create are stubs under ownership flags', () => {
  const boot = readFileSync(join(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8');
  const surface = readFileSync(join(root, 'src/composition/channels-surface.js'), 'utf8');
  assert.match(surface, /__RIM_CHANNEL_DIRECTORY_OWNED/);
  assert.match(surface, /__RIM_CHANNEL_COMMANDS_OWNED/);
  assert.doesNotMatch(boot, /from\("channels"\)\s*\.select\("\*"\)/);
});
test('channel feed exposes publish and react', () => {
  const feed = readFileSync(join(root, 'src/application/channel-feed-controller.js'), 'utf8');
  const surface = readFileSync(join(root, 'src/composition/channels-surface.js'), 'utf8');
  assert.match(feed, /publishFromComposer/);
  assert.match(feed, /reactToPost/);
  assert.match(surface, /rimPublishPost/);
  assert.match(surface, /rimReactChannelPost/);
});
test('bootstrap LOC budget moving down', () => {
  const boot = readFileSync(join(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8');
  const lines = boot.split(/\n/).length;
  assert.ok(lines <= 350, `expected <=350 lines, got ${lines}`);
});
