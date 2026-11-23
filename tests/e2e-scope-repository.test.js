import test from 'node:test';
import assert from 'node:assert/strict';
import { E2EScopeRepository } from '../src/infrastructure/supabase/e2e-scope-repository.js';

test('E2EScopeRepository fails closed until protocol adapter is ready', async () => {
  const repository = new E2EScopeRepository({ rpc: async () => ({ data: true, error: null }) }, { protocolReady: false });
  const result = await repository.requestEnable({ type: 'direct', id: 'd1' });
  assert.equal(result.ok, false);
  assert.match(result.error.message, /зашифрованного обмена/);
});

test('E2EScopeRepository refuses public channels before making a backend request', async () => {
  let called = false;
  const repository = new E2EScopeRepository({ rpc: async () => { called = true; return { data: true, error: null }; } }, { protocolReady: true });
  const result = await repository.requestEnable({ type: 'channel', id: 'c1', is_public: true });
  assert.equal(result.ok, false);
  assert.equal(called, false);
});


test('E2E scope readiness reads the same device registry used by the Signal relay', async () => {
  const calls = [];
  const responses = {
    conversations: { data: { id: 'direct-1', type: 'direct', e2e_mode: 'required', e2e_epoch: 1 }, error: null },
    conversation_members: { data: [{ user_id: 'user-a' }, { user_id: 'user-b' }], error: null },
  };
  const client = {
    rpc(name, args) {
      calls.push({ rpc: name, args });
      return Promise.resolve({ data: [
        { user_id: 'user-a', status: 'active', protocol_profile: 'OPEN-E2EE-SP1' },
        { user_id: 'user-b', status: 'active', protocol_profile: 'OPEN-E2EE-SP1' },
      ], error: null });
    },
    from(table) {
      calls.push({ table });
      const state = { table };
      const query = {
        select(fields) { state.fields = fields; return query; },
        eq(key, value) { (state.filters ||= []).push([key, value]); return query; },
        in(key, value) { (state.filters ||= []).push([key, value]); return query; },
        maybeSingle: async () => responses[state.table],
        then(resolve, reject) { return Promise.resolve(responses[state.table]).then(resolve, reject); },
      };
      return query;
    },
  };
  const repository = new E2EScopeRepository(client, { protocolReady: true });
  const result = await repository.getScope({ type: 'direct', id: 'direct-1' }, 'user-a');
  assert.equal(result.ok, true);
  assert.equal(result.value.readiness.ready, true);
  assert.equal(result.value.peerUserId, 'user-b');
  assert.ok(calls.some(call => call.rpc === 'rim_e2e_get_scope_device_readiness'));
  assert.ok(!calls.some(call => call.table === 'rim_e2e_relay_devices'));
  assert.ok(!calls.some(call => call.table === 'rim_e2e_devices'));
});

test('E2E scope readiness RPC is membership-scoped and exposes only active registered device metadata', async () => {
  const migration = await import('node:fs').then(fs => fs.readFileSync(new URL('../supabase/migrations/20261121200000_rim_iteration_145_e2e_scope_readiness_rpc.sql', import.meta.url), 'utf8'));
  assert.match(migration, /security definer/i);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /conversation_access_denied/);
  assert.match(migration, /channel_access_denied/);
  assert.match(migration, /devices\.registered = true/);
  assert.match(migration, /grant execute .* to authenticated/i);
  assert.match(migration, /revoke all .* from public, anon/i);
  assert.doesNotMatch(migration, /grant select .*rim_e2e_relay_devices/i);
});


test('E2E scope readiness does not call relay registry RPC for off or pending scopes', async () => {
  for (const mode of ['off', 'pending']) {
    let rpcCalls = 0;
    const client = {
      rpc: async () => { rpcCalls++; return { data: [], error: null }; },
      from() {
        const response = { data: { id: 'direct-1', type: 'direct', e2e_mode: mode, e2e_epoch: 0 }, error: null };
        const query = { select() { return query; }, eq() { return query; }, maybeSingle: async () => response };
        return query;
      }
    };
    const repository = new E2EScopeRepository(client, { protocolReady: false });
    const result = await repository.getScope({ type: 'direct', id: 'direct-1' }, 'user-a');
    assert.equal(result.ok, true);
    assert.equal(result.value.enabled, false);
    assert.equal(rpcCalls, 0);
  }
});

test('missing E2E foundation column is treated as legacy-off only for the exact schema error', async () => {
  const client = { from() {
    const query = { select() { return query; }, eq() { return query; }, maybeSingle: async () => ({ data: null, error: { code: '42703', message: 'column conversations.e2e_mode does not exist' } }) };
    return query;
  } };
  const repository = new E2EScopeRepository(client, { protocolReady: false });
  const result = await repository.getScope({ type: 'direct', id: 'direct-1' }, 'user-a');
  assert.equal(result.ok, true);
  assert.equal(result.value.enabled, false);
  assert.equal(result.value.schemaUnavailable, true);
});


test('unknown E2E mode is not silently treated as plaintext-off', async () => {
  const client = { from() {
    const query = { select() { return query; }, eq() { return query; }, maybeSingle: async () => ({ data: { id: 'direct-1', type: 'direct', e2e_mode: null }, error: null }) };
    return query;
  } };
  const repository = new E2EScopeRepository(client, { protocolReady: false });
  const result = await repository.getScope({ type: 'direct', id: 'direct-1' }, 'user-a');
  assert.equal(result.ok, false);
  assert.match(result.error.message, /Неизвестный режим E2E/);
});

test('private group and channel requests activate only after a verified scope exchange', async () => {
  const calls = [];
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: name === 'rim_e2e_activate_scope' ? { e2e_mode: 'required', e2e_epoch: 1 } : { e2e_mode: 'pending' }, error: null }; } };
  const repository = new E2EScopeRepository(client, { isScopeVerified: scope => scope.id === 'g1' || scope.id === 'ch1' });
  const group = await repository.requestEnable({ type: 'group', id: 'g1', is_private: true });
  const channel = await repository.requestEnable({ type: 'private_channel', id: 'ch1', is_public: false });
  assert.equal(group.ok, true);
  assert.equal(channel.ok, true);
  assert.deepEqual(calls.map(call => call.name), ['rim_e2e_request_scope_enable', 'rim_e2e_activate_scope', 'rim_e2e_request_scope_enable', 'rim_e2e_activate_scope']);
});

test('group and private-channel readiness returns the full member list for pairwise fan-out', async () => {
  const client = {
    rpc: async () => ({ data: [{ user_id: 'user-a', status: 'active', protocol_profile: 'OPEN-E2EE-SP1' }, { user_id: 'user-b', status: 'active', protocol_profile: 'OPEN-E2EE-SP1' }], error: null }),
    from(table) {
      const response = table === 'conversations'
        ? { data: { id: 'g1', type: 'group', is_private: true, e2e_mode: 'required', e2e_epoch: 1 }, error: null }
        : { data: [{ user_id: 'user-a' }, { user_id: 'user-b' }], error: null };
      const query = { select() { return query; }, eq() { return query; }, maybeSingle: async () => response, then(resolve, reject) { return Promise.resolve(response).then(resolve, reject); } };
      return query;
    }
  };
  const repository = new E2EScopeRepository(client, { isScopeVerified: () => true });
  const result = await repository.getScope({ type: 'group', id: 'g1', is_private: true }, 'user-a');
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.memberUserIds, ['user-a', 'user-b']);
  assert.equal(result.value.readiness.ready, true);
});

test('E2E scope activation accepts only the exact scope verified by Signal exchange', async () => {
  const calls = [];
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { accepted: true }, error: null }; } };
  const repository = new E2EScopeRepository(client, {
    protocolReady: false,
    isScopeVerified: scope => scope.type === 'direct' && scope.id === 'direct-verified'
  });
  const rejected = await repository.requestEnable({ type: 'direct', id: 'direct-other' });
  assert.equal(rejected.ok, false);
  const accepted = await repository.requestEnable({ type: 'direct', id: 'direct-verified' });
  assert.equal(accepted.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'rim_e2e_request_scope_enable');
});
