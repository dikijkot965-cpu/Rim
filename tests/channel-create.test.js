import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelCommandService } from '../src/application/channel-command-service.js';

test('channel creation validates input and uses the atomic RPC', async () => {
  const calls = [];
  const service = new ChannelCommandService({
    client: { rpc: async (name, args) => { calls.push({ name, args }); return { data: 'ch1', error: null }; } },
    getUser: () => ({ id: 'u1' }),
    closeModal: () => calls.push('close'),
    reloadDirectory: async () => calls.push('directory'),
    reloadChannel: async id => calls.push(['open', id])
  });
  assert.equal((await service.create({ title: '' })).ok, false);
  assert.equal((await service.create({ title: 'News', username: 'bad handle' })).ok, false);
  assert.equal(calls.length, 0);

  const result = await service.create({ title: 'Вести', description: 'd', isPublic: false });
  assert.equal(result.ok, true);
  assert.deepEqual(calls[0], {
    name: 'rim_create_channel',
    args: { p_title: 'Вести', p_description: 'd', p_username: null, p_is_public: false, p_avatar_path: null }
  });
  assert.equal(result.value.id, 'ch1');
  assert.ok(calls.includes('close'));
  assert.ok(calls.includes('directory'));
  assert.ok(calls.some(call => Array.isArray(call) && call[0] === 'open' && call[1] === 'ch1'));
});
