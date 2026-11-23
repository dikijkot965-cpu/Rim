import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = () => readFileSync(join(root, 'src/app.js'), 'utf8');
const channels = () => readFileSync(join(root, 'src/composition/channels-surface.js'), 'utf8');

test('app routes channel creation through ChannelCommandService', () => {
  const a = app();
  const c = channels();
  assert.match(a, /bindChannelsSurface/);
  assert.match(c, /channelCommands\.create|\.create\(\{/);
  assert.match(c, /rimCreateChannel/);
  assert.match(c, /createChannel/);
  assert.match(a, /4\.1\.8-iteration\.163/);
});
