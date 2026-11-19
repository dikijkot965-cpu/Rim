import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('app routes rimOpenChannelSettings to ChannelSettingsController', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  const composition = readFileSync(join(root, 'src/composition/channels-surface.js'), 'utf8');
  assert.match(app, /bindChannelsSurface/);
  // class lives in composition modules: // moved to composition: assert.match(app, /ChannelSettingsController/);
  assert.match(app, /ChannelSettingsRepository/);
  assert.match(composition, /ChannelSettingsController/);
  assert.match(composition, /rimOpenChannelSettings/);
  assert.match(composition, /channelSettings\.open|settings\.open/);
  assert.match(app, /4\.0\.0-iteration\.\d+/);
});

test('legacy channel settings mutations remain available', () => {
  const legacy = readFileSync(join(root, 'assets/js/legacy/17-rim-stability-channel-management.js'), 'utf8');
  for (const name of ['rimSaveChannelSettings', 'rimModerateChannel', 'rimChannelUnrestrict']) {
    assert.match(legacy, new RegExp(`window\\.${name}\\s*=`));
  }
});
