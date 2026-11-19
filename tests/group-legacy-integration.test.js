import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('app routes rimOpenGroupSettings to GroupSettingsController', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  const groups = readFileSync(join(root, 'src/composition/groups-surface.js'), 'utf8');
  assert.match(app, /bindGroupsSurface/);
  // class lives in composition modules: // moved to composition: assert.match(app, /GroupSettingsController/);
  assert.match(app, /GroupRepository/);
  assert.match(groups, /GroupSettingsController/);
  assert.match(groups, /rimOpenGroupSettings/);
  assert.match(groups, /groupSettings\.open/);
  assert.match(app, /4\.0\.0-iteration\.\d+/);
});

test('legacy group mutation entrypoints remain present for delegated actions', () => {
  const legacy = readFileSync(join(root, 'assets/js/legacy/20-rim-update-groups.js'), 'utf8');
  for (const name of [
    'rimSaveGroupSettings',
    'rimGroupAddMember',
    'rimGroupRemoveMember',
    'rimGroupSetRole',
    'rimGroupLeave',
    'rimPickGroupAvatar',
    'rimUploadGroupAvatar',
    'rimGroupMakeInvite',
    'rimCopyGroupInvite',
    'rimGroupRevokeInvite',
    'rimGroupTransferOwner',
    'rimJoinGroupByInvite'
  ]) {
    assert.match(legacy, new RegExp(`window\\.${name}\\s*=`));
  }
});

test('group repository and controller modules export expected symbols', async () => {
  const repo = await import('../src/infrastructure/supabase/group-repository.js');
  const controller = await import('../src/application/group-settings-controller.js');
  assert.equal(typeof repo.GroupRepository, 'function');
  assert.equal(typeof controller.GroupSettingsController, 'function');
  assert.equal(typeof controller.renderGroupSettingsModal, 'function');
});
