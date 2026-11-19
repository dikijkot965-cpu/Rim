import test from 'node:test';
import assert from 'node:assert/strict';
import { GroupCommandService } from '../src/application/group-command-service.js';

function baseService(overrides = {}) {
  return new GroupCommandService({
    client: {
      rpc: async (name, args) => ({ data: true, error: null, name, args }),
      from() {
        return {
          insert: async () => ({ error: null }),
          select() { return this; },
          eq() { return this; },
          single: async () => ({ data: { title: 'G', description: '', is_private: true }, error: null }),
          maybeSingle: async () => ({ data: { id: 'u2', username: 'bob' }, error: null }),
          in: async () => ({ data: [], error: null })
        };
      },
      storage: { from() { return { upload: async () => ({ error: null }), remove: async () => ({}) }; } }
    },
    getUser: () => ({ id: 'u1' }),
    getConversations: () => [{ id: 'g1', title: 'G' }],
    reopenSettings: async () => {},
    openConversation: async () => {},
    reloadConversations: async () => {},
    closeModal: () => {},
    confirm: () => true,
    prompt: () => 'bob',
    ...overrides
  });
}

test('saveSettings requires title', async () => {
  const service = baseService();
  const result = await service.saveSettings('g1', { title: '' });
  assert.equal(result.ok, false);
});

test('addMember calls rim_group_add_member', async () => {
  const calls = [];
  const service = baseService({
    client: {
      rpc: async (name, args) => { calls.push({ name, args }); return { data: true, error: null }; },
      from() { return { select() { return this; }, eq() { return this; }, single: async () => ({ data: {}, error: null }) }; }
    }
  });
  const result = await service.addMember('g1', '@bob');
  assert.equal(result.ok, true);
  assert.equal(calls[0].name, 'rim_group_add_member');
});

test('leave can cancel', async () => {
  const service = baseService({ confirm: () => false });
  const result = await service.leave('g1');
  assert.equal(result.ok, true);
  assert.equal(result.value.cancelled, true);
});

test('joinByInvite opens conversation on success', async () => {
  const opens = [];
  const service = baseService({
    client: {
      rpc: async () => ({ data: 'g9', error: null }),
      from() { return {}; }
    },
    openConversation: async id => opens.push(id),
    reloadConversations: async () => opens.push('reload')
  });
  const result = await service.joinByInvite('CODE');
  assert.equal(result.ok, true);
  assert.deepEqual(opens, ['reload', 'g9']);
});
