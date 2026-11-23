import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignalProtocolClient } from '@open-e2ee/signal-protocol-sdk';
import { inMemoryStore } from '@open-e2ee/signal-protocol-sdk/local/store/memory';
import { SupabaseSignalProtocolRelay } from '../src/security/e2e/supabase-signal-relay.js';

class RelayBackend {
  constructor() {
    this.devices = new Map();
    this.identities = new Map();
    this.prekeys = new Map();
    this.envelopes = new Map();
    this.channels = new Set();
    this.nextId = 1;
  }
  key(user, device) { return `${user}:${device}`; }
  async invoke(action, body) {
    if (action === 'register_device') {
      const id = Number(body.device.deviceId || 1);
      const key = this.key(body.userId, id);
      if (this.devices.get(key)?.registered) throw new Error('primary_device_already_registered');
      this.devices.set(key, { deviceId: id, registered: false, enabled: true, deviceType: body.device.deviceType || 'web' });
      return id;
    }
    if (action === 'get_devices' || action === 'get_active_devices') {
      const rows = [...this.devices.entries()].filter(([key, row]) => key.startsWith(`${body.userId}:`) && row.registered && row.enabled).map(([, row]) => ({ ...row }));
      return action === 'get_active_devices' ? rows.map(row => ({ userId: body.userId, deviceId: row.deviceId })) : rows;
    }
    if (action === 'provision_identity' || action === 'rotate_identity') {
      const identityKey = `${body.userId}:${body.identityType || 'aci'}`;
      const existing = this.identities.get(identityKey);
      if (action === 'provision_identity' && existing && JSON.stringify(existing.identity) !== JSON.stringify(body.identity)) throw new Error('identity_tuple_mismatch_requires_rotation');
      this.identities.set(identityKey, { identity: body.identity, registrationId: body.registrationId });
      const device = this.devices.get(this.key(body.userId, body.deviceId));
      if (!device) throw new Error('device_not_active');
      device.registered = true;
      return true;
    }
    if (action === 'get_identity') return this.identities.get(`${body.userId}:${body.identityType || 'aci'}`)?.identity || null;
    if (action === 'upload_prekeys') {
      const key = `${body.userId}:${body.identityType || 'aci'}:${body.deviceId}`;
      const inventory = this.prekeys.get(key) || { ecPreKey: [], ecSignedPreKey: null, kemOneTimePreKey: [], kemLastResortPreKey: null };
      for (const item of body.keys) {
        if (item.type === 'ecPreKey') inventory.ecPreKey.push(item);
        else if (item.type === 'ecSignedPreKey') inventory.ecSignedPreKey = item;
        else if (item.type === 'kemOneTimePreKey') inventory.kemOneTimePreKey.push(item);
        else if (item.type === 'kemLastResortPreKey') inventory.kemLastResortPreKey = item;
      }
      this.prekeys.set(key, inventory);
      return true;
    }
    if (action === 'prekey_inventory') {
      const inv = this.prekeys.get(`${body.userId}:${body.identityType || 'aci'}:${body.deviceId}`) || {};
      return { ecSignedPreKey: inv.ecSignedPreKey || null, kemLastResortPreKey: inv.kemLastResortPreKey || null, ecOneTimePreKeyCount: inv.ecPreKey?.length || 0, kemOneTimePreKeyCount: inv.kemOneTimePreKey?.length || 0 };
    }
    if (action === 'prekey_metadata') {
      const inv = this.prekeys.get(`${body.userId}:${body.identityType || 'aci'}:${body.deviceId}`) || {};
      return body.keyType === 'ecSignedPreKey' ? inv.ecSignedPreKey || null : inv.kemLastResortPreKey || null;
    }
    if (action === 'clear_stale_kem') return { cleared: 0 };
    if (action === 'fetch_prekey_bundle') {
      if (!Number.isInteger(Number(body.requesterDeviceId)) || Number(body.requesterDeviceId) < 1) throw new Error('requester_device_not_registered');
      const key = `${body.userId}:${body.identityType || 'aci'}:${body.deviceId}`;
      const inv = this.prekeys.get(key);
      const identity = this.identities.get(`${body.userId}:${body.identityType || 'aci'}`);
      if (!inv || !identity || !inv.ecSignedPreKey || !inv.kemLastResortPreKey) return null;
      const ec = inv.ecPreKey.shift();
      const kem = inv.kemOneTimePreKey.shift();
      return { registrationId: identity.registrationId, deviceId: Number(body.deviceId), identity: identity.identity,
        ecSignedPreKey: inv.ecSignedPreKey,
        ...(ec ? { ecOneTimePreKey: { keyId: ec.keyId, publicKey: ec.publicKey } } : {}),
        ...(kem ? { kemOneTimePreKey: kem } : { kemLastResortPreKey: inv.kemLastResortPreKey }) };
    }
    if (action === 'send') {
      const envelope = { ...body.envelope, id: `env-${this.nextId++}`, serverTimestamp: Date.now() };
      this.envelopes.set(envelope.id, envelope);
      for (const channel of this.channels) {
        if (channel.userId === envelope.targetUserId && channel.deviceId === Number(envelope.targetDeviceId)) {
          channel.callback?.({ new: { id: envelope.id, target_user_id: envelope.targetUserId, target_device_id: envelope.targetDeviceId,
            sender_user_id: envelope.senderUserId, sender_device_id: envelope.senderDeviceId, ciphertext: envelope.ciphertext,
            message_type: envelope.messageType, delivery_class: envelope.deliveryClass, timestamp_ms: envelope.timestamp,
            client_message_id: envelope.clientMessageId || null, created_at: new Date(envelope.serverTimestamp).toISOString(), expires_at: new Date(Date.now()+86400000).toISOString() } });
        }
      }
      return { messageId: envelope.id, serverTimestamp: envelope.serverTimestamp, duplicate: false, expiresAt: Date.now()+86400000 };
    }
    if (action === 'pull') {
      return [...this.envelopes.values()].filter(row => row.targetUserId === body.userId && Number(row.targetDeviceId) === Number(body.deviceId)).map(row => ({
        id: row.id, target_user_id: row.targetUserId, target_device_id: row.targetDeviceId,
        sender_user_id: row.senderUserId, sender_device_id: row.senderDeviceId, ciphertext: row.ciphertext,
        message_type: row.messageType, delivery_class: row.deliveryClass, timestamp_ms: row.timestamp,
        client_message_id: row.clientMessageId || null, created_at: new Date(row.serverTimestamp).toISOString(),
        cursorCreatedAt: new Date(row.serverTimestamp).toISOString(), cursorId: row.id
      }));
    }
    if (action === 'mark_delivered') { this.envelopes.delete(body.envelopeId); return true; }
    throw new Error(`unsupported_action:${action}`);
  }
  client(userId) {
    const backend = this;
    return {
      functions: { invoke: async (_name, { body }) => {
        try { return { data: { result: await backend.invoke(body.action, { ...body, userId: body.userId || userId }) }, error: null }; }
        catch (error) { return { data: null, error: { message: error.message } }; }
      } },
      channel(name) {
        const match = name.match(/^rim-e2e-mailbox:([^:]+):(\d+)$/);
        const channel = { userId: match?.[1], deviceId: Number(match?.[2]), callback: null,
          on(_type, _config, callback) { this.callback = callback; return this; },
          subscribe(callback) { backend.channels.add(this); callback?.('SUBSCRIBED'); return this; } };
        return channel;
      },
      removeChannel(channel) { backend.channels.delete(channel); return Promise.resolve('ok'); }
    };
  }
}

async function waitFor(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Timed out waiting for RIM relay-adapter decryption.')), timeoutMs); })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

test('OpenE2EE PQ/Braid two-account round trip uses the actual RIM Supabase relay adapter contract', async t => {
  const backend = new RelayBackend();
  const aliceRelay = new SupabaseSignalProtocolRelay({ client: backend.client('rim-e2e-alice'), userId: 'rim-e2e-alice' });
  const bobRelay = new SupabaseSignalProtocolRelay({ client: backend.client('rim-e2e-bob'), userId: 'rim-e2e-bob' });
  await aliceRelay.registerDevice('rim-e2e-alice', { deviceId: 1, deviceType: 'web' });
  await bobRelay.registerDevice('rim-e2e-bob', { deviceId: 1, deviceType: 'web' });
  const alice = await createSignalProtocolClient({
    identity: { userId: 'rim-e2e-alice' }, adapters: { storage: inMemoryStore(), relay: aliceRelay },
    protocol: { postQuantum: 'required', braid: 'required' }
  });
  let received;
  let resolveReceived;
  const receivedPromise = new Promise(resolve => { resolveReceived = resolve; });
  const bob = await createSignalProtocolClient({
    identity: { userId: 'rim-e2e-bob' }, adapters: { storage: inMemoryStore(), relay: bobRelay },
    protocol: { postQuantum: 'required', braid: 'required' },
    hooks: { onMessageDecrypted: async message => { received = message; resolveReceived(message); } }
  });
  t.after(async () => {
    await alice.stop?.(); await bob.stop?.(); await alice.close?.(); await bob.close?.();
    await aliceRelay.dispose(); await bobRelay.dispose();
  });
  await alice.syncToServer();
  await bob.syncToServer();
  bob.startRelaySubscription();
  const sent = await alice.send('rim-e2e-bob', 'RIM actual relay-adapter PQ/Braid round-trip', { clientMessageId: 'adapter-test-1' });
  await waitFor(receivedPromise, 10000);
  assert.equal(received.content, 'RIM actual relay-adapter PQ/Braid round-trip');
  assert.equal(received.senderId, 'rim-e2e-alice');
  assert.equal(sent.recipientDeviceCount, 1);
});

import { RimSignalProtocolRuntime } from '../src/security/e2e/signal-protocol-runtime.js';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

class TestLocalMessageStore {
  constructor() { this.rows = new Map(); }
  async put(message) {
    const row = { ...message };
    this.rows.set(String(row.messageId), row);
    return row;
  }
  async acceptIncoming(envelope, { expectedUserId } = {}) {
    const payload = JSON.parse(String(envelope?.content || ''));
    if (payload.type !== 'rim.chat.text.v1' || !payload.conversationId || typeof payload.body !== 'string') return null;
    return this.put({
      messageId: envelope.messageId,
      conversationId: payload.conversationId,
      body: payload.body,
      senderId: envelope.senderId,
      recipientId: payload.recipientId || expectedUserId || '',
      replyTo: payload.replyTo || null,
      timestamp: Number(payload.timestamp || envelope.timestamp || Date.now()),
      direction: 'incoming'
    });
  }
  async getConversation(conversationId) {
    return [...this.rows.values()].filter(row => String(row.conversationId) === String(conversationId));
  }
  close() {}
}

test('RIM runtime performs two-account Signal PQ/Braid send, decrypt and local timeline persistence', async t => {
  const backend = new RelayBackend();
  const users = { alice: { id: 'rim-runtime-alice' }, bob: { id: 'rim-runtime-bob' } };
  const stores = { alice: new TestLocalMessageStore(), bob: new TestLocalMessageStore() };
  const createRuntime = name => new RimSignalProtocolRuntime({
    getUser: () => users[name],
    messageStore: stores[name],
    relayFactory: ({ userId }) => new SupabaseSignalProtocolRelay({ client: backend.client(userId), userId }),
    onDecryptedMessage: (envelope, context) => stores[name].acceptIncoming(envelope, context),
    importSdk: async () => await import('@open-e2ee/signal-protocol-sdk'),
    importWebSqliteStore: async () => ({ webSqliteStore: async () => inMemoryStore() }),
    environment: { ...globalThis, isSecureContext: true, indexedDB: {}, crypto: globalThis.crypto }
  });
  const alice = createRuntime('alice');
  const bob = createRuntime('bob');
  t.after(async () => { await alice.dispose(); await bob.dispose(); });

  const [aliceState, bobState] = await Promise.all([alice.startIncoming(), bob.startIncoming()]);
  assert.equal(aliceState.protocolReady, false, 'mock transport must never promote production readiness');
  assert.equal(bobState.protocolReady, false, 'mock transport must never promote production readiness');

  const sent = await alice.sendDirect('rim-runtime-bob', 'RIM runtime end-to-end integration proof', {
    conversationId: 'rim-runtime-direct-conversation',
    clientMessageId: 'runtime-integration-158-1'
  });
  assert.ok(sent.messageId);
  assert.equal(sent.localPersisted, true);
  const relayEnvelope = [...backend.envelopes.values()].find(row => row.targetUserId === 'rim-runtime-bob');
  assert.ok(relayEnvelope?.ciphertext, 'relay must receive an opaque ciphertext envelope');
  assert.equal(Object.hasOwn(relayEnvelope, 'body'), false, 'relay envelope must not expose a plaintext body field');
  assert.equal(Buffer.from(relayEnvelope.ciphertext, 'base64').includes(Buffer.from('RIM runtime end-to-end integration proof')), false, 'plaintext must not appear in the encoded relay ciphertext');

  await waitFor((async () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const rows = await stores.bob.getConversation('rim-runtime-direct-conversation');
      if (rows.length) return rows[0];
      await delay(20);
    }
    throw new Error('Timed out waiting for runtime local message persistence.');
  })(), 5000);

  const [aliceRows, bobRows] = await Promise.all([
    alice.getLocalConversation('rim-runtime-direct-conversation'),
    bob.getLocalConversation('rim-runtime-direct-conversation')
  ]);
  assert.equal(aliceRows.length, 1);
  assert.equal(aliceRows[0].body, 'RIM runtime end-to-end integration proof');
  assert.equal(aliceRows[0].direction, 'outgoing');
  assert.equal(bobRows.length, 1);
  assert.equal(bobRows[0].body, 'RIM runtime end-to-end integration proof');
  assert.equal(bobRows[0].direction, 'incoming');
  assert.equal(bobRows[0].senderId, 'rim-runtime-alice');
});
