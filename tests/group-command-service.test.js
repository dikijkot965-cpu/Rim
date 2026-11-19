import test from 'node:test';
import assert from 'node:assert/strict';
import { GroupCommandService } from '../src/application/group-command-service.js';

test('create validates title and username', async () => {
  const service = new GroupCommandService({
    client: { rpc: async () => ({ data: { id: 'g1' }, error: null }) },
    getUser: () => ({ id: 'u1' })
  });
  assert.equal((await service.create({ title: '' })).ok, false);
  assert.equal((await service.create({ title: 'G', username: 'x' })).ok, false);
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
      rpc: async (name, args) => { calls.push({ name, args }); return { data: { id: 'g1' }, error: null }; },
      storage: { from() { return { upload: async () => ({ error: null }), remove: async () => ({}) }; } }
    },
    getUser: () => ({ id: 'u1' }),
    closeModal: () => calls.push('close'),
    afterCreate: async () => calls.push('after')
  });
  const result = await service.create({
    title: 'Штаб',
    username: 'shtab_rim',
    memberUsernames: ['bob'],
    isPublic: true
  });
  assert.equal(result.ok, true);
  assert.equal(calls[0].name, 'create_public_group_chat');
  assert.deepEqual(calls[0].args.invited_users, ['u2']);
  assert.ok(calls.includes('close'));
  assert.ok(calls.includes('after'));
});
