import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('core-release defers music and channel settings to modular owners', () => {
  const core = readFileSync(join(root, 'assets/js/core/rim-core-release.js'), 'utf8');
  assert.match(core, /__RIM_CHANNEL_SETTINGS_OWNED/);
  assert.match(core, /rimOpenChannelSettings/);
  assert.match(core, /__RIM_MUSIC_OWNED/);
});

test('bootstrap remains a thin shim', () => {
  const boot = readFileSync(join(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8');
  assert.ok(boot.split(/\n/).length <= 300);
});
