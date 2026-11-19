import test from 'node:test';
import assert from 'node:assert/strict';
import { AdminCommandService } from '../src/application/admin-command-service.js';

test('findAdChannels requires two characters', async () => {
  const service = new AdminCommandService({
    client: { from() { return this; } },
    getUser: () => ({ id: 'u1' }),
    canManage: () => true
  });
  assert.equal((await service.findAdChannels('a')).ok, false);
});

test('findAdChannels queries channels', async () => {
  const service = new AdminCommandService({
    client: {
      from() {
        return {
          select() { return this; },
          or() { return this; },
          order() { return this; },
          limit: async () => ({ data: [{ id: 'c1', title: 'News', username: 'news' }], error: null })
        };
      }
    },
    getUser: () => ({ id: 'u1' }),
    canManage: () => true
  });
  const result = await service.findAdChannels('ne');
  assert.equal(result.ok, true);
  assert.equal(result.value[0].id, 'c1');
});

test('listSessions and revokeSession call RPCs', async () => {
  const calls = [];
  const service = new AdminCommandService({
    client: {
      rpc: async (name, args) => { calls.push({ name, args }); return { data: name.includes('list') ? [] : true, error: null }; }
    },
    getUser: () => ({ id: 'u1' }),
    canManage: () => true,
    confirm: () => true
  });
  assert.equal((await service.listSessions('u2')).ok, true);
  assert.equal((await service.revokeSession('s1')).ok, true);
  assert.equal(calls[0].name, 'rim_admin_list_sessions');
  assert.equal(calls[1].name, 'rim_admin_revoke_session');
});
