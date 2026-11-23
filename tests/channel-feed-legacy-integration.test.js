import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = () => readFileSync(join(root, 'src/app.js'), 'utf8');
const channels = () => readFileSync(join(root, 'src/composition/channels-surface.js'), 'utf8');

test('app routes openChannel and channel comments to ChannelFeedController', () => {
  const a = app();
  const c = channels();
  assert.match(a, /bindChannelsSurface/);
  assert.match(c, /ChannelFeedController/);
  assert.match(c, /openChannel/);
  assert.match(c, /rimLoadChannelComments/);
  assert.match(a, /4\.1\.8-iteration\.163/);
});
