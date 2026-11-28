import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelCommandService } from '../src/application/channel-command-service.js';

test('create calls the atomic channel RPC with selected privacy and catalog metadata', async () => {
  const calls = [];
  const service = new ChannelCommandService({
    client: {
      rpc: async (name, args) => { calls.push({ name, args }); return { data: 'channel-1', error: null }; }
    },
    getUser: () => ({ id: 'u1' }),
    closeModal: () => calls.push('close'),
    reloadDirectory: async () => calls.push('directory'),
    reloadChannel: async id => calls.push(['open', id])
  });
  const result = await service.create({
    title: 'Новости',
    description: 'Канал проекта',
    username: 'rim_news',
    isPublic: true
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls[0], {
    name: 'rim_create_channel',
    args: {
      p_title: 'Новости',
      p_description: 'Канал проекта',
      p_username: 'rim_news',
      p_is_public: true,
      p_avatar_path: null
    }
  });
  assert.equal(result.value.id, 'channel-1');
  assert.equal(result.value.is_public, true);
  assert.ok(calls.includes('close'));
  assert.ok(calls.includes('directory'));
  assert.ok(calls.some(call => Array.isArray(call) && call[0] === 'open' && call[1] === 'channel-1'));
});

test('create rejects an invalid username before making a server request', async () => {
  let called = false;
  const service = new ChannelCommandService({
    client: { rpc: async () => { called = true; return { data: 'channel-1', error: null }; } },
    getUser: () => ({ id: 'u1' })
  });
  const result = await service.create({ title: 'Новости', username: 'bad handle' });
  assert.equal(result.ok, false);
  assert.equal(called, false);
});

test('create cleans up an uploaded avatar when the atomic RPC fails', async () => {
  const calls = [];
  const service = new ChannelCommandService({
    client: {
      storage: { from: () => ({
        upload: async path => { calls.push(['upload', path]); return { error: null }; },
        remove: async paths => { calls.push(['remove', paths]); return { error: null }; }
      }) },
      rpc: async () => ({ data: null, error: new Error('RPC denied') })
    },
    getUser: () => ({ id: 'u1' })
  });
  const result = await service.create({
    title: 'Новости',
    avatarFile: { size: 128, type: 'image/png', name: 'avatar.png' }
  });
  assert.equal(result.ok, false);
  assert.equal(calls[0][0], 'upload');
  assert.equal(calls[1][0], 'remove');
  assert.equal(calls[1][1][0], calls[0][1]);
});
