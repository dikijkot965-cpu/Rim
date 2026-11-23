import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SupabaseSignalProtocolRelay } from '../src/security/e2e/supabase-signal-relay.js';
import { inspectSignalRelayContract } from '../src/security/e2e/signal-protocol-runtime.js';

function makeClient({ invoke = async (_name, { body }) => ({ data: { result: body.action === 'register_device' ? 1 : true }, error: null }), onSubscribe = null } = {}) {
  const calls = [];
  const channel = {
    on(event, config, callback) { calls.push({ event, config }); this.callback = callback; return this; },
    subscribe(callback) { onSubscribe?.(callback, this); callback?.('SUBSCRIBED'); return this; },
  };
  return {
    calls,
    channel: () => channel,
    removeChannel: () => Promise.resolve('ok'),
    functions: { invoke: async (name, options) => { calls.push({ name, body: options.body }); return invoke(name, options); } },
    emit: row => channel.callback?.({ new: row }),
  };
}

test('RIM Supabase relay implements every required SDK 14 relay operation', () => {
  const relay = new SupabaseSignalProtocolRelay({ client: makeClient(), userId: 'user-a' });
  const contract = inspectSignalRelayContract(relay);
  assert.equal(contract.valid, true, contract.missing.join(', '));
});

test('RIM relay refuses cross-account device registration and prekey publication', async () => {
  const relay = new SupabaseSignalProtocolRelay({ client: makeClient(), userId: 'user-a' });
  await assert.rejects(() => relay.registerDevice('user-b', { deviceType: 'web' }), /another RIM account/);
  await assert.rejects(() => relay.uploadPreKeys('user-b', 1, []), /owner mismatch/);
});

test('RIM relay normalizes binary ciphertext to canonical base64 before server submission', async () => {
  let submitted;
  const client = makeClient({ invoke: async (_name, { body }) => { submitted = body; return { data: { result: { messageId: 'm-1', serverTimestamp: 123 } }, error: null }; } });
  const relay = new SupabaseSignalProtocolRelay({ client, userId: 'user-a' });
  const result = await relay.send({
    senderUserId: 'user-a', senderDeviceId: 1, targetUserId: 'user-b', targetDeviceId: 1,
    ciphertext: new Uint8Array([1, 2, 3]), messageType: 'ciphertext', deliveryClass: 'user-visible', timestamp: 100,
  });
  assert.equal(submitted.action, 'send');
  assert.equal(submitted.envelope.ciphertext, 'AQID');
  assert.equal(result.messageId, 'm-1');
});

test('RIM relay realtime subscription filters device envelopes and performs mailbox recovery', async () => {
  const client = makeClient({ invoke: async (_name, { body }) => ({ data: { result: body.action === 'pull' ? [{
    id: 'env-1', target_user_id: 'user-a', target_device_id: 1, sender_user_id: 'user-b', sender_device_id: 1,
    ciphertext: 'AQID', message_type: 'ciphertext', delivery_class: 'user-visible', timestamp_ms: 10, created_at: new Date(10).toISOString(),
  }] : true }, error: null }) });
  const relay = new SupabaseSignalProtocolRelay({ client, userId: 'user-a' });
  await relay.registerDevice('user-a', { deviceType: 'web' });
  const received = [];
  const unsubscribe = relay.subscribe('user-a', 1, envelope => received.push(envelope));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(relay.relayConnectionState.state, 'connected');
  assert.equal(received.length, 1);
  assert.deepEqual([...received[0].ciphertext], [1, 2, 3]);
  unsubscribe();
  assert.equal(relay.relayConnectionState.state, 'stopped');
});

test('Iteration 142 wires the relay into the on-demand Signal runtime and keeps E2E fail-closed', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const migration = fs.readFileSync(new URL('../supabase/migrations/20261121180000_rim_iteration_142_e2e_relay.sql', import.meta.url), 'utf8');
  const edge = fs.readFileSync(new URL('../supabase/functions/rim-e2e-relay/index.ts', import.meta.url), 'utf8');
  const runtime = fs.readFileSync(new URL('../src/security/e2e/signal-protocol-runtime.js', import.meta.url), 'utf8');
  assert.match(app, /new SupabaseSignalProtocolRelay/);
  assert.match(app, /relayFactory:/);
  assert.match(migration, /rim_e2e_relay_fetch_prekey_bundle/);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /on conflict \(user_id,device_id,identity_type,key_type,key_id\) do nothing/i);
  assert.match(migration, /registered=true for update/i);
  assert.match(migration, /rim_e2e_relay_send_envelope/);
  assert.match(migration, /revoke all on function .* from public,anon,authenticated/s);
  assert.match(edge, /auth\.getUser\(jwt\)/);
  assert.match(edge, /senderUserId !== actor/);
  assert.match(runtime, /this\.protocolReady = false/);
});

test('RIM relay serializes concurrent prekey publication decisions per device', async () => {
  const calls = [];
  const client = makeClient({ invoke: async (_name, { body }) => {
    calls.push(body.action);
    if (body.action === 'prekey_inventory') return { data: { result: { ecSignedPreKey: null, kemLastResortPreKey: null, ecOneTimePreKeyCount: 0, kemOneTimePreKeyCount: 0 } }, error: null };
    return { data: { result: true }, error: null };
  } });
  const relay = new SupabaseSignalProtocolRelay({ client, userId: 'user-a' });
  let active = 0;
  let maximumActive = 0;
  const plan = async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise(resolve => setTimeout(resolve, 8));
    active -= 1;
    return [];
  };
  await Promise.all([
    relay.publishPlannedPreKeys('user-a', 1, plan),
    relay.publishPlannedPreKeys('user-a', 1, plan),
  ]);
  assert.equal(maximumActive, 1);
  assert.deepEqual(calls, ['prekey_inventory', 'prekey_inventory']);
});

test('RIM relay mailbox recovery paginates beyond the first 250 pending envelopes', async () => {
  let pullPage = 0;
  const client = makeClient({ invoke: async (_name, { body }) => {
    if (body.action !== 'pull') return { data: { result: true }, error: null };
    pullPage += 1;
    const count = pullPage === 1 ? 250 : 1;
    const base = pullPage === 1 ? 0 : 250;
    const rows = Array.from({ length: count }, (_, index) => {
      const n = base + index + 1;
      return {
        id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, target_user_id: 'user-a', target_device_id: 1,
        sender_user_id: 'user-b', sender_device_id: 1, ciphertext: 'AQID',
        message_type: 'ciphertext', delivery_class: 'user-visible', timestamp_ms: n,
        created_at: new Date(n * 1000).toISOString(), cursorCreatedAt: new Date(n * 1000).toISOString(), cursorId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      };
    });
    return { data: { result: rows }, error: null };
  } });
  const relay = new SupabaseSignalProtocolRelay({ client, userId: 'user-a' });
  await relay.registerDevice('user-a', { deviceType: 'web' });
  const received = [];
  const unsubscribe = relay.subscribe('user-a', 1, envelope => received.push(envelope));
  await new Promise(resolve => setTimeout(resolve, 30));
  unsubscribe();
  assert.equal(pullPage, 2);
  assert.equal(received.length, 251);
});


test('RIM relay requires a registered local device before fetching peer prekeys', async () => {
  const relay = new SupabaseSignalProtocolRelay({ client: makeClient(), userId: 'user-a' });
  await assert.rejects(() => relay.fetchPreKeyBundle('user-b', 1), /Register this E2E device/);
});

test('RIM relay can bind an already registered device after browser restart without re-registering it', async () => {
  let submitted;
  const client = makeClient({ invoke: async (_name, { body }) => {
    submitted = body;
    return { data: { result: { registrationId: 42, deviceId: 1 } }, error: null };
  } });
  const relay = new SupabaseSignalProtocolRelay({ client, userId: 'user-a' });
  assert.equal(relay.setCurrentDevice('user-a', 2), 2);
  const bundle = await relay.fetchPreKeyBundle('user-b', 1);
  assert.equal(submitted.requesterDeviceId, 2);
  assert.equal(bundle.registrationId, 42);
  assert.throws(() => relay.setCurrentDevice('user-b', 1), /another RIM account/);
  assert.throws(() => relay.setCurrentDevice('user-a', 6), /integer from 1 to 5/);
});

test('RIM relay binds prekey fetches to the authenticated local device', async () => {
  let submitted;
  const client = makeClient({ invoke: async (_name, { body }) => {
    submitted = body;
    return { data: { result: body.action === 'register_device' ? 1 : { registrationId: 42, deviceId: 1 } }, error: null };
  } });
  const relay = new SupabaseSignalProtocolRelay({ client, userId: 'user-a' });
  await relay.registerDevice('user-a', { deviceId: 1, deviceType: 'web' });
  const bundle = await relay.fetchPreKeyBundle('user-b', 1);
  assert.equal(submitted.action, 'fetch_prekey_bundle');
  assert.equal(submitted.requesterDeviceId, 1);
  assert.equal(submitted.userId, 'user-b');
  assert.equal(bundle.deviceId, 1);
});

test('Iteration 143 hardens prekey consumption, account device registration and sender sync', () => {
  const migration = fs.readFileSync(new URL('../supabase/migrations/20261121190000_rim_iteration_143_e2e_relay_hardening.sql', import.meta.url), 'utf8');
  const edge = fs.readFileSync(new URL('../supabase/functions/rim-e2e-relay/index.ts', import.meta.url), 'utf8');
  const relay = fs.readFileSync(new URL('../src/security/e2e/supabase-signal-relay.js', import.meta.url), 'utf8');
  assert.match(migration, /secure_device_link_required/);
  assert.match(migration, /primary_device_already_registered/);
  assert.match(migration, /prekey_fetch_rate_limited/);
  assert.match(migration, /attempts < 30/);
  assert.match(migration, /requester_device_not_registered/);
  assert.match(migration, /KEM availability is checked BEFORE consuming the EC one-time/);
  assert.match(migration, /'needsSync',v_needs_sync/);
  assert.match(edge, /p_requester_device_id: asInt\(body\.requesterDeviceId/);
  assert.match(edge, /prekey_fetch_rate_limited.*return 429/s);
  assert.match(relay, /requesterDeviceId: this\._lastDeviceId/);
});



test('Iteration 149 binds mailbox acknowledgements to the exact active registered device', () => {
  const migration = fs.readFileSync(new URL('../supabase/migrations/20261121210000_rim_iteration_149_e2e_relay_ack_device_guard.sql', import.meta.url), 'utf8');
  const edge = fs.readFileSync(new URL('../supabase/functions/rim-e2e-relay/index.ts', import.meta.url), 'utf8');
  assert.match(migration, /d\.status = 'active'/);
  assert.match(migration, /d\.registered = true/);
  assert.match(migration, /d\.enabled = true/);
  assert.match(migration, /e\.target_device_id = p_device_id/);
  assert.match(migration, /grant execute .* to service_role/s);
  assert.match(edge, /\.eq\("enabled", true\)\.single\(\)/);
  assert.match(edge, /p_envelope_id: asUuid\(body\.envelopeId/);
  assert.match(edge, /const UUID_PATTERN/);
  assert.match(edge, /invalid_cursor_created_at/);
});

test('RIM relay deduplicates the same envelope arriving through Realtime and mailbox recovery', async () => {
  const row = {
    id: 'env-race-1', target_user_id: 'user-a', target_device_id: 1,
    sender_user_id: 'user-b', sender_device_id: 1, ciphertext: 'AQID',
    message_type: 'ciphertext', delivery_class: 'user-visible', timestamp_ms: 10,
    created_at: new Date(10).toISOString(), expires_at: new Date(Date.now() + 60000).toISOString(),
  };
  const client = makeClient({ invoke: async (_name, { body }) => ({
    data: { result: body.action === 'pull' ? [row] : true }, error: null
  }) });
  const relay = new SupabaseSignalProtocolRelay({ client, userId: 'user-a' });
  await relay.registerDevice('user-a', { deviceId: 1, deviceType: 'web' });
  let deliveries = 0;
  const unsubscribe = relay.subscribe('user-a', 1, async envelope => {
    deliveries += 1;
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(envelope.id, row.id);
  });
  await new Promise(resolve => setTimeout(resolve, 2));
  client.emit(row);
  await new Promise(resolve => setTimeout(resolve, 50));
  unsubscribe();
  assert.equal(deliveries, 1);
});

test('RIM relay retries an envelope after the first delivery callback fails', async () => {
  const row = {
    id: 'env-retry-1', target_user_id: 'user-a', target_device_id: 1,
    sender_user_id: 'user-b', sender_device_id: 1, ciphertext: 'AQID',
    message_type: 'ciphertext', delivery_class: 'user-visible', timestamp_ms: 10,
    created_at: new Date(10).toISOString(), expires_at: new Date(Date.now() + 60000).toISOString(),
  };
  const client = makeClient({ invoke: async (_name, { body }) => ({ data: { result: body.action === 'pull' ? [] : true }, error: null }) });
  const relay = new SupabaseSignalProtocolRelay({ client, userId: 'user-a' });
  await relay.registerDevice('user-a', { deviceId: 1, deviceType: 'web' });
  let attempts = 0;
  const unsubscribe = relay.subscribe('user-a', 1, async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('simulated transient SDK failure');
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  client.emit(row);
  await new Promise(resolve => setTimeout(resolve, 0));
  client.emit(row);
  await new Promise(resolve => setTimeout(resolve, 10));
  unsubscribe();
  assert.equal(attempts, 2);
  await relay.dispose();
});

test('RIM relay stops mailbox recovery delivery after its subscription is cancelled', async () => {
  let releasePull;
  const pullPending = new Promise(resolve => { releasePull = resolve; });
  const row = {
    id: 'env-cancelled-pull', target_user_id: 'user-a', target_device_id: 1,
    sender_user_id: 'user-b', sender_device_id: 1, ciphertext: 'AQID',
    message_type: 'ciphertext', delivery_class: 'user-visible', timestamp_ms: 10,
    created_at: new Date(10).toISOString(), expires_at: new Date(Date.now() + 60000).toISOString(),
  };
  const client = makeClient({ invoke: async (_name, { body }) => body.action === 'pull'
    ? pullPending.then(() => ({ data: { result: [row] }, error: null }))
    : ({ data: { result: true }, error: null }) });
  const relay = new SupabaseSignalProtocolRelay({ client, userId: 'user-a' });
  await relay.registerDevice('user-a', { deviceId: 1, deviceType: 'web' });
  let deliveries = 0;
  const unsubscribe = relay.subscribe('user-a', 1, async () => { deliveries += 1; });
  unsubscribe();
  releasePull();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(deliveries, 0);
  await relay.dispose();
});

test('RIM relay coalesces duplicate SUBSCRIBED mailbox recovery events', async () => {
  let emitStatus;
  let releasePull;
  const pullPending = new Promise(resolve => { releasePull = resolve; });
  let pullCalls = 0;
  const client = makeClient({
    onSubscribe: callback => { emitStatus = callback; },
    invoke: async (_name, { body }) => {
      if (body.action !== 'pull') return { data: { result: true }, error: null };
      pullCalls += 1;
      return pullPending.then(() => ({ data: { result: [] }, error: null }));
    }
  });
  const relay = new SupabaseSignalProtocolRelay({ client, userId: 'user-a' });
  await relay.registerDevice('user-a', { deviceId: 1, deviceType: 'web' });
  const unsubscribe = relay.subscribe('user-a', 1, async () => {});
  emitStatus?.('SUBSCRIBED');
  emitStatus?.('SUBSCRIBED');
  assert.equal(pullCalls, 1);
  releasePull();
  await new Promise(resolve => setTimeout(resolve, 10));
  unsubscribe();
  await relay.dispose();
});
