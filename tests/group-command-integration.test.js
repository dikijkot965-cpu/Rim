import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test('app routes group create and channel role through command services', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  const groups = readFileSync(join(root, 'src/composition/groups-surface.js'), 'utf8');
  const channels = readFileSync(join(root, 'src/composition/channels-surface.js'), 'utf8');
  assert.match(app, /bindGroupsSurface/);
  // class lives in composition modules: // moved to composition: assert.match(app, /GroupCommandService/);
  assert.match(groups, /GroupCommandService/);
  assert.match(groups, /rimCreateGroup/);
  assert.match(channels, /setMemberRoleByUsername/);
  assert.match(app, /4\.1\.8-iteration\.163/);
});
