import test from 'node:test';
import assert from 'node:assert/strict';
import { AdminCommandService } from '../src/application/admin-command-service.js';

test('sendNotice requires title and body', async () => {
  const service = new AdminCommandService({
    client: { rpc: async () => ({ data: 1, error: null }) },
    getUser: () => ({ id: 'u1' }),
    canManage: () => true
  });
  assert.equal((await service.sendNotice({ title: '', body: 'x' })).ok, false);
});

test('sendNotice resolves username then calls RPC', async () => {
  const calls = [];
  const service = new AdminCommandService({
    client: {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: { id: 'u9' }, error: null })
        };
      },
      rpc: async (name, args) => { calls.push({ name, args }); return { data: 3, error: null }; }
    },
    getUser: () => ({ id: 'u1' }),
    canManage: () => true
  });
  const result = await service.sendNotice({ username: '@bob', title: 'Hi', body: 'Text' });
  assert.equal(result.ok, true);
  assert.equal(result.value, 3);
  assert.equal(calls[0].name, 'rim_admin_send_notice');
  assert.equal(calls[0].args.p_user_id, 'u9');
});

test('dashboardStats aggregates RPC payloads', async () => {
  const service = new AdminCommandService({
    client: {
      rpc: async (name) => {
        if (name === 'rim_admin_dashboard_stats_v2') return { data: { users_total: 10 }, error: null };
        return { data: [{ day: '2026-01-01' }], error: null };
      }
    },
    getUser: () => ({ id: 'u1' }),
    canManage: () => true
  });
  const result = await service.dashboardStats();
  assert.equal(result.ok, true);
  assert.equal(result.value.stats.users_total, 10);
  assert.equal(result.value.series.length, 1);
});
