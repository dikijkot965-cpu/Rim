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

test('create resolves members and calls RPC', async () => {
  const calls = [];
  const service = new GroupCommandService({
    client: {
      from() {
        return {
          select() { return this; },
          in() { return Promise.resolve({ data: [{ id: 'u2', username: 'bob' }], error: null }); }
        };
      },
      rpc: async (name, args) => { calls.push({ name, args }); return name === 'create_group_chat' ? { data: 'g1', error: null } : { data: { id: 'g1', is_private: false }, error: null }; },
      storage: { from() { return { upload: async () => ({ error: null }), remove: async () => ({}) }; } }
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
  assert.equal(calls[0].name, 'create_group_chat');
  assert.deepEqual(calls[0].args, { group_title: 'Штаб', invited_users: ['u2'] });
  assert.equal(calls[1].name, 'rim_group_update_settings');
  assert.equal(calls[1].args.p_is_private, false);
  assert.equal(calls[1].args.p_conversation_id, 'g1');
  assert.ok(calls.includes('close'));
  assert.ok(calls.includes('after'));
});
