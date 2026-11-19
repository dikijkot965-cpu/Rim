import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test('app owns appearance preference routes', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  const surface = readFileSync(join(root, 'src/composition/settings-surface.js'), 'utf8');
  assert.match(app, /bindSettingsSurface/);
  // class lives in composition modules: // moved to composition: assert.match(app, /AppearancePreferencesService/);
  assert.match(surface, /AppearancePreferencesService/);
  assert.match(surface, /__RIM_APPEARANCE_OWNED\s*=\s*true/);
  assert.match(surface, /changeTheme/);
  assert.match(surface, /changeLanguage/);
  assert.match(app, /4\.0\.0-iteration\.122/);
});
