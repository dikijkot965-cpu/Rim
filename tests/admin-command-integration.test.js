import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test('app routes admin ads toggle and role updates through AdminCommandService', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  const admin = readFileSync(join(root, 'src/composition/admin-surface.js'), 'utf8');
  assert.match(app, /bindAdminSurface/);
  // class lives in composition modules: // moved to composition: assert.match(app, /AdminCommandService/);
  assert.match(admin, /AdminCommandService/);
  assert.match(admin, /rimToggleAds/);
  assert.match(admin, /rimAdminSetRole/);
  assert.match(app, /4\.1\.8-iteration\.163/);
});
