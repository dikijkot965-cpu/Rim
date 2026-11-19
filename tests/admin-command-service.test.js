import test from 'node:test';
import assert from 'node:assert/strict';
import { AdminCommandService } from '../src/application/admin-command-service.js';

test('toggleAds requires admin', async () => {
  const service = new AdminCommandService({
    client: { from() { return { update() { return this; }, eq: async () => ({ error: null }) }; } },
    getUser: () => ({ id: 'u1' }),
    canManage: () => false
  });
  const result = await service.toggleAds(true);
  assert.equal(result.ok, false);
});

test('toggleAds updates platform settings', async () => {
  const calls = [];
  const service = new AdminCommandService({
    client: {
      from(table) {
        calls.push(['from', table]);
        return {
          update(payload) { calls.push(['update', payload]); return this; },
          eq(column, value) { calls.push(['eq', column, value]); return Promise.resolve({ error: null }); }
        };
      }
    },
    getUser: () => ({ id: 'u1' }),
    canManage: () => true
  });
  const result = await service.toggleAds(false);
  assert.equal(result.ok, true);
  assert.equal(result.value, false);
  assert.ok(calls.some(call => call[0] === 'update' && call[1].ads_enabled === false));
});

test('setUserRole validates role and calls RPC', async () => {
  const calls = [];
  const service = new AdminCommandService({
    client: {
      rpc: async (name, args) => { calls.push({ name, args }); return { error: null }; }
    },
    getUser: () => ({ id: 'u1' }),
    canManage: () => true
  });
  assert.equal((await service.setUserRole('u2', 'nope')).ok, false);
  const ok = await service.setUserRole('u2', 'moderator');
  assert.equal(ok.ok, true);
  assert.equal(calls[0].name, 'rim_admin_update_user_role');
  assert.equal(calls[0].args.p_role, 'moderator');
});
