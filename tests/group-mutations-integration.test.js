import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test('app routes group mutation commands modularly', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  const groups = readFileSync(join(root, 'src/composition/groups-surface.js'), 'utf8');
  assert.match(app, /bindGroupsSurface/);
  for (const name of [
    'rimSaveGroupSettings', 'rimGroupAddMember', 'rimGroupRemoveMember', 'rimGroupSetRole',
    'rimGroupLeave', 'rimUploadGroupAvatar', 'rimGroupMakeInvite', 'rimGroupRevokeInvite',
    'rimGroupTransferOwner', 'rimJoinGroupByInvite', 'rimJoinPublicGroup'
  ]) {
    assert.match(groups, new RegExp(name));
  }
  assert.match(app, /4\.1\.8-iteration\.163/);
});
