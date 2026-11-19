import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('appearance service exposes loadFromServer', () => {
  const src = readFileSync(join(root, 'src/application/appearance-preferences-service.js'), 'utf8');
  assert.match(src, /async loadFromServer\(/);
  assert.match(src, /user_settings/);
});

test('profile controller can ensure missing profile', () => {
  const src = readFileSync(join(root, 'src/application/profile-controller.js'), 'utf8');
  assert.match(src, /async ensureProfile\(/);
  assert.match(src, /user_/);
});

test('settings surface binds loadProfile and loadSettings', () => {
  const surface = readFileSync(join(root, 'src/composition/settings-surface.js'), 'utf8');
  assert.match(surface, /win\.loadSettings/);
  assert.match(surface, /win\.loadProfile/);
  assert.match(surface, /__RIM_APPEARANCE_OWNED/);
  assert.match(surface, /__RIM_PROFILE_OWNED/);
});

test('bootstrap settings/profile dual-bind to modular owners', () => {
  const boot = readFileSync(join(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8');
  assert.match(boot, /__RIM_PROFILE_OWNED.*loadProfile/s);
  assert.match(boot, /__RIM_APPEARANCE_OWNED.*loadSettings/s);
  const lines = boot.split(/\n/).length;
  assert.ok(lines < 300, `lines ${lines}`);
});
