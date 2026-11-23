import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test('app routes admin notice, stats and users list modularly', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  const admin = readFileSync(join(root, 'src/composition/admin-surface.js'), 'utf8');
  assert.match(app, /bindAdminSurface/);
  assert.match(admin, /sendNotice/);
  assert.match(admin, /dashboardStats/);
  assert.match(admin, /rimAdminSendNotice/);
  assert.match(admin, /rimLoadStats/);
  assert.match(admin, /rimLoadAdminUsers/);
  assert.match(app, /4\.1\.8-iteration\.163/);
});
