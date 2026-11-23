import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test('app owns imperial session role projection', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  const admin = readFileSync(join(root, 'src/composition/admin-surface.js'), 'utf8');
  assert.match(app, /bindAdminSurface/);
  // class lives in composition modules: // moved to composition: assert.match(app, /ImperialSessionController/);
  assert.match(admin, /ImperialSessionController/);
  assert.match(admin, /__RIM_IMPERIAL_SESSION_OWNED\s*=\s*true/);
  assert.match(admin, /isImperator/);
  assert.match(app, /4\.1\.8-iteration\.163/);
});
