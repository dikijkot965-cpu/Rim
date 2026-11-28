import test from 'node:test';
import assert from 'node:assert/strict';
import { GroupCommandService } from '../src/application/group-command-service.js';

test('create validates title against the production RPC limit', async () => {
  const service = new GroupCommandService({
    client: { rpc: async () => ({ data: { id: 'g1' }, error: null }) },
    getUser: () => ({ id: 'u1' })
  });
  assert.equal((await service.create({ title: '' })).ok, false);
  assert.equal((await service.create({ title: 'G'.repeat(61) })).ok, false);
});

test('create resolves members and atomically persists creator, visibility and avatar', async () => {
  const calls = [];
  const service = new GroupCommandService({
    client: {
      from() {
        return {
          select() { return this; },
          in() { return Promise.resolve({ data: [{ id: 'u2', username: 'bob' }], error: null }); }
        };
      },
      rpc: async (name, args) => { calls.push({ name, args }); return { data: 'g1', error: null }; },
      storage: { from() { return { upload: async () => ({ error: null }), remove: async () => ({ error: null }) }; } }
    },
    getUser: () => ({ id: 'u1' }),
    closeModal: () => calls.push('close'),
    afterCreate: async () => calls.push('after')
  });
  const result = await service.create({
    title: 'Штаб',
    memberUsernames: ['bob'],
    isPublic: true
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls[0], {
    name: 'rim_create_group_chat',
    args: { p_title: 'Штаб', p_invited_users: ['u2'], p_is_private: false, p_avatar_path: null }
  });
  assert.equal(calls.some(call => call?.name === 'rim_group_update_settings'), false);
  assert.ok(calls.includes('close'));
  assert.ok(calls.includes('after'));
  assert.deepEqual(result.value, { id: 'g1', is_private: false, avatar_path: null });
});

test('create allows a group with no invited members', async () => {
  let payload;
  const service = new GroupCommandService({
    client: { rpc: async (name, args) => { payload = { name, args }; return { data: 'g-empty', error: null }; } },
    getUser: () => ({ id: 'u1' })
  });
  const result = await service.create({ title: 'Моя группа', isPublic: false });
  assert.equal(result.ok, true);
  assert.deepEqual(payload, {
    name: 'rim_create_group_chat',
    args: { p_title: 'Моя группа', p_invited_users: [], p_is_private: true, p_avatar_path: null }
  });
});

test('joinPublic uses the server-side public group membership RPC', async () => {
  const calls = [];
  const service = new GroupCommandService({
    client: { rpc: async (name, args) => { calls.push([name, args]); return { data: 'g-public', error: null }; } },
    getUser: () => ({ id: 'u1' }),
    reloadConversations: async () => calls.push('reload'),
    openConversation: async id => calls.push(['open', id])
  });
  const result = await service.joinPublic('g-public');
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    ['rim_group_join_public', { p_conversation_id: 'g-public' }],
    'reload',
    ['open', 'g-public']
  ]);
});

test('create removes an uploaded avatar when the atomic RPC rejects the group', async () => {
  const calls = [];
  const service = new GroupCommandService({
    client: {
      storage: { from() { return {
        upload: async path => { calls.push(['upload', path]); return { error: null }; },
        remove: async paths => { calls.push(['remove', paths]); return { error: null }; }
      }; } },
      rpc: async () => ({ data: null, error: new Error('RPC denied') })
    },
    getUser: () => ({ id: 'u1' })
  });
  const result = await service.create({
    title: 'Аватарная группа',
    avatarFile: { size: 128, type: 'image/png', name: 'avatar.png' }
  });
  assert.equal(result.ok, false);
  assert.equal(calls[0][0], 'upload');
  assert.equal(calls[1][0], 'remove');
  assert.equal(calls[1][1][0], calls[0][1]);
});
