import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('channel directory reads and filtering are retired from the legacy channel script', async () => {
  const [legacy, app, composition, controller, repository] = await Promise.all([
    readFile(path.join(root, 'assets/js/legacy/17-rim-stability-channel-management.js'), 'utf8'),
    readFile(path.join(root, 'src/app.js'), 'utf8'),
    readFile(path.join(root, 'src/composition/channels-surface.js'), 'utf8'),
    readFile(path.join(root, 'src/application/channel-directory-controller.js'), 'utf8'),
    readFile(path.join(root, 'src/infrastructure/supabase/channel-repository.js'), 'utf8')
  ]);
  assert.doesNotMatch(legacy, /window\.loadChannels\s*=|window\.rimFilterChannels\s*=/);
  assert.doesNotMatch(legacy, /from\('channels'\)\.select\('\*'\)\.order\('created_at'/);
  assert.doesNotMatch(legacy, /from\('channel_members'\)\.select\('channel_id'\)\.eq\('user_id'/);
  assert.match(legacy, /window\.rimJoinChannel=async/);
  assert.match(legacy, /window\.rimLeaveChannel=async/);
  assert.match(app, /bindChannelsSurface/);
  assert.match(composition, /ChannelDirectoryController/);
  assert.match(composition, /loadChannels/);
  assert.match(composition, /rimFilterChannels/);
  assert.match(controller, /requestSequence/);
  assert.match(controller, /data-rim-channel-action/);
  assert.match(repository, /from\('channel_members'\)/);
});
