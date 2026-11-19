import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test('app owns settings shell entrypoint', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  const surface = readFileSync(join(root, 'src/composition/settings-surface.js'), 'utf8');
  assert.match(app, /bindSettingsSurface/);
  // class lives in composition modules: // moved to composition: assert.match(app, /SettingsShellController/);
  assert.match(surface, /SettingsShellController/);
  assert.match(surface, /__RIM_SETTINGS_SHELL_OWNED\s*=\s*true/);
  assert.match(surface, /openSettings/);
  assert.match(app, /4\.0\.0-iteration\.122/);
});
