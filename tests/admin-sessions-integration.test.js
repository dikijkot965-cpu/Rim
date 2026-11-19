import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test('app routes admin channel search and sessions modularly', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  const admin = readFileSync(join(root, 'src/composition/admin-surface.js'), 'utf8');
  assert.match(app, /bindAdminSurface/);
  assert.match(admin, /findAdChannels/);
  assert.match(admin, /listSessions/);
  assert.match(admin, /rimFindAdChannels/);
  assert.match(admin, /rimAdminShowUserSessions/);
  assert.match(admin, /rimAdminRevokeSession/);
  assert.match(app, /4\.0\.0-iteration\.122/);
});
