import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignalProtocolClient } from '@open-e2ee/signal-protocol-sdk';
import { inMemoryStore } from '@open-e2ee/signal-protocol-sdk/local/store/memory';
import { RimSignalProtocolRuntime } from '../src/security/e2e/signal-protocol-runtime.js';

class InMemorySignalRelay {
  constructor() {
    this.devices = new Map();
    this.identities = new Map();
    this.prekeys = new Map();
    this.subscribers = new Map();
    this.envelopes = new Map();
    this.sentEnvelopes = [];
    this.nextMessage = 1;
    this.listeners = new Set();
    this.relayConnectionState = { state: 'stopped', since: Date.now() };
    this.signalProtocolRelayConnectionState = this.relayConnectionState;
  }
  #key(userId, deviceId) { return `${userId}:${deviceId}`; }
  #device(userId, deviceId) { return this.devices.get(this.#key(userId, deviceId)); }
  #setState(state) {
    this.relayConnectionState = this.signalProtocolRelayConnectionState = { state, since: Date.now() };
    for (const listener of this.listeners) listener(this.relayConnectionState);
  }
  async registerDevice(userId, device = {}) {
    const deviceId = Number(device.deviceId || (this.getDevices(userId).length ? this.getDevices(userId).length + 1 : 1));
    this.devices.set(this.#key(userId, deviceId), { deviceId, registered: false, linked: deviceId > 1, enabled: true, deviceType: device.deviceType || 'web' });
    return deviceId;
  }
  async removeDevice(userId, deviceId) { this.devices.delete(this.#key(userId, deviceId)); this.prekeys.delete(this.#key(userId, deviceId)); }
  setCurrentDevice() {}
  async provisionIdentityKey(request) {
    const key = `${request.userId}:${request.identityType || 'aci'}`;
    const prior = this.identities.get(key);
    if (prior && JSON.stringify(prior.identity) !== JSON.stringify(request.identity)) throw new Error('identity mismatch');
    this.identities.set(key, { identity: request.identity, registrationId: request.registrationId });
    const device = this.#device(request.userId, request.deviceId);
    device.registered = true;
  }
  async rotateIdentityKey(request) {
    this.identities.set(`${request.userId}:${request.identityType || 'aci'}`, { identity: request.identity, registrationId: request.registrationId });
    for (const [key, value] of this.prekeys) if (key.startsWith(`${request.userId}:${request.identityType || 'aci'}:`)) this.prekeys.delete(key);
  }
  async getIdentityKey(userId, identityType = 'aci') { return this.identities.get(`${userId}:${identityType}`)?.identity || null; }
  async uploadPreKeys(userId, deviceId, keys, identityType = 'aci') {
    const key = `${userId}:${identityType}:${deviceId}`;
    const inventory = this.prekeys.get(key) || { ecPreKey: [], ecSignedPreKey: null, kemOneTimePreKey: [], kemLastResortPreKey: null };
    for (const item of keys) {
      if (item.type === 'ecPreKey') inventory.ecPreKey.push(item);
      else if (item.type === 'kemOneTimePreKey') inventory.kemOneTimePreKey.push(item);
      else if (item.type === 'ecSignedPreKey') inventory.ecSignedPreKey = item;
      else if (item.type === 'kemLastResortPreKey') inventory.kemLastResortPreKey = item;
    }
    this.prekeys.set(key, inventory);
  }
  async fetchPreKeyBundle(userId, deviceId, _fetcher, identityType = 'aci') {
    const inventory = this.prekeys.get(`${userId}:${identityType}:${deviceId}`);
    const identity = await this.getIdentityKey(userId, identityType);
    const device = this.#device(userId, deviceId);
    if (!inventory || !identity || !device?.registered || !inventory.ecSignedPreKey || !inventory.kemLastResortPreKey) return null;
    const ec = inventory.ecPreKey.shift();
    const kem = inventory.kemOneTimePreKey.shift();
    return {
      registrationId: this.identities.get(`${userId}:${identityType}`).registrationId,
      deviceId, identity,
      ecSignedPreKey: inventory.ecSignedPreKey,
      ...(ec ? { ecOneTimePreKey: { keyId: ec.keyId, publicKey: ec.publicKey } } : {}),
      ...(kem ? { kemOneTimePreKey: kem } : { kemLastResortPreKey: inventory.kemLastResortPreKey }),
    };
  }
  async getPreKeyCount(userId, deviceId, type, identityType = 'aci') {
    const inv = this.prekeys.get(`${userId}:${identityType}:${deviceId}`) || {};
    return type === 'ec' ? (inv.ecPreKey?.length || 0) : (inv.kemOneTimePreKey?.length || 0);
  }
  async getPreKeyInventory(userId, deviceId, identityType = 'aci') {
    const inv = this.prekeys.get(`${userId}:${identityType}:${deviceId}`) || {};
    const meta = item => item ? { keyId: item.keyId, createdAt: Date.now(), expiresAt: Date.now() + 86400000, publicKey: item.publicKey } : null;
    return { ecSignedPreKey: meta(inv.ecSignedPreKey), kemLastResortPreKey: meta(inv.kemLastResortPreKey), ecOneTimePreKeyCount: inv.ecPreKey?.length || 0, kemOneTimePreKeyCount: inv.kemOneTimePreKey?.length || 0 };
  }
  async clearStaleKemPreKeys(userId, deviceId, identityType = 'aci') {
    const inv = this.prekeys.get(`${userId}:${identityType}:${deviceId}`); const cleared = inv?.kemOneTimePreKey?.length || 0;
    if (inv) inv.kemOneTimePreKey = [];
    return { cleared };
  }
  async publishPlannedPreKeys(userId, deviceId, plan, identityType = 'aci') { const inv = await this.getPreKeyInventory(userId, deviceId, identityType); const keys = await plan(inv); if (keys?.length) await this.uploadPreKeys(userId, deviceId, keys, identityType); }
  async getEcSignedPreKeyMetadata(userId, deviceId, identityType = 'aci') { return (await this.getPreKeyInventory(userId, deviceId, identityType)).ecSignedPreKey; }
  async getKemLastResortPreKeyMetadata(userId, deviceId, identityType = 'aci') { return (await this.getPreKeyInventory(userId, deviceId, identityType)).kemLastResortPreKey; }
  getDevices(userId) { return [...this.devices.entries()].filter(([key, d]) => key.startsWith(`${userId}:`) && d.registered && d.enabled).map(([, d]) => ({ ...d })); }
  async getActiveDevices(userId) { return this.getDevices(userId).map(d => ({ userId, deviceId: d.deviceId })); }
  async send(envelope) {
    const id = `relay-${this.nextMessage++}`;
    const delivered = { ...envelope, id, serverTimestamp: Date.now() };
    this.envelopes.set(id, delivered);
    this.sentEnvelopes.push(delivered);
    for (const callback of this.subscribers.get(this.#key(envelope.targetUserId, envelope.targetDeviceId)) || []) await callback(delivered);
    return { messageId: id, serverTimestamp: delivered.serverTimestamp, duplicate: false, expiresAt: Date.now() + 86400000 };
  }
  subscribe(userId, deviceId, callback) {
    const key = this.#key(userId, deviceId); const set = this.subscribers.get(key) || new Set(); set.add(callback); this.subscribers.set(key, set); this.#setState('connected');
    return () => { set.delete(callback); if (!set.size) this.subscribers.delete(key); this.#setState('stopped'); };
  }
  async markDelivered(envelopeId) { this.envelopes.delete(envelopeId); }
  subscribeRelayConnectionState(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  subscribeSignalProtocolRelayConnectionState(listener) { return this.subscribeRelayConnectionState(listener); }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitForStored(store, conversationId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = await store.getConversation(conversationId);
    if (rows.length) return rows;
    await delay(20);
  }
  return store.getConversation(conversationId);
}

test('OpenE2EE SDK completes an actual post-quantum two-account encrypted round trip over the RIM relay contract', async t => {
  const relay = new InMemorySignalRelay();
  let received;
  let resolveReceived;
  const receivedPromise = new Promise(resolve => { resolveReceived = resolve; });
  await relay.registerDevice('rim-e2e-alice', { deviceId: 1, deviceType: 'web' });
  await relay.registerDevice('rim-e2e-bob', { deviceId: 1, deviceType: 'web' });
  const alice = await createSignalProtocolClient({
    identity: { userId: 'rim-e2e-alice' }, adapters: { storage: inMemoryStore(), relay },
    protocol: { postQuantum: 'required', braid: 'required' },
  });
  const bob = await createSignalProtocolClient({
    identity: { userId: 'rim-e2e-bob' }, adapters: { storage: inMemoryStore(), relay },
    protocol: { postQuantum: 'required', braid: 'required' },
    hooks: { onMessageDecrypted: async message => { received = message; resolveReceived(message); } },
  });
  t.after(async () => { await alice.stop?.(); await bob.stop?.(); await alice.close?.(); await bob.close?.(); });
  await alice.syncToServer();
  await bob.syncToServer();
  bob.startRelaySubscription();
  const sent = await alice.send('rim-e2e-bob', 'RIM E2E round-trip verification');
  await Promise.race([receivedPromise, delay(8000).then(() => { throw new Error('Timed out waiting for decrypted message.'); })]);
  assert.equal(received.content, 'RIM E2E round-trip verification');
  assert.equal(received.senderId, 'rim-e2e-alice');
  assert.equal(sent.recipientDeviceCount, 1);
});


class RuntimeTestMessageStore {
  constructor() { this.rows = new Map(); }
  async put(message) { this.rows.set(String(message.messageId), { ...message }); return message; }
  async acceptIncoming(envelope, { expectedUserId } = {}) {
    const raw = envelope?.content ?? envelope?.body ?? '';
    let payload;
    try { payload = JSON.parse(String(raw)); } catch { return null; }
    if (payload?.type !== 'rim.chat.text.v1' || typeof payload.body !== 'string' || !payload.conversationId) return null;
    return this.put({
      messageId: String(envelope.messageId), conversationId: String(payload.conversationId),
      body: payload.body, senderId: String(envelope.senderId || ''),
      recipientId: String(payload.recipientId || expectedUserId || ''),
      timestamp: Number(payload.timestamp || Date.now()), direction: 'incoming'
    });
  }
  async getConversation(conversationId) {
    return [...this.rows.values()].filter(row => String(row.conversationId) === String(conversationId));
  }
  close() {}
}

async function createRuntimeAccount(userId, relay) {
  const store = new RuntimeTestMessageStore();
  const runtime = new RimSignalProtocolRuntime({
    getUser: () => ({ id: userId }), messageStore: store,
    relayFactory: async () => relay,
    onDecryptedMessage: (envelope, context) => store.acceptIncoming(envelope, context),
    authorizePeerVerification: async ({ senderUserId, localUserId }) => Boolean(senderUserId && localUserId),
    importSdk: async () => await import('@open-e2ee/signal-protocol-sdk'),
    importWebSqliteStore: async () => ({ webSqliteStore: async () => inMemoryStore() }),
    environment: { ...globalThis, isSecureContext: true, indexedDB: {}, crypto: globalThis.crypto }
  });
  return { runtime, store };
}

test('RIM runtime delivers encrypted fan-out to every private-group participant', async t => {
  const relay = new InMemorySignalRelay();
  const accounts = await Promise.all(['rim-group-a', 'rim-group-b', 'rim-group-c'].map(id => createRuntimeAccount(id, relay)));
  t.after(async () => Promise.all(accounts.map(account => account.runtime.dispose())));
  await Promise.all(accounts.map(account => account.runtime.startIncoming()));
  const members = ['rim-group-a', 'rim-group-b', 'rim-group-c'];
  assert.ok(accounts.every(account => account.runtime.protocolReady === false), 'the in-memory relay must not be promoted to production readiness');

  const sent = await accounts[0].runtime.sendGroup(members, 'Private group E2E test payload', {
    conversationId: 'private-group-174', scopeType: 'group', clientMessageId: 'group-174-message-1'
  });
  assert.equal(sent.acceptedRecipientCount, 2);
  assert.equal(sent.failedRecipientCount, 0);
  for (const account of accounts.slice(1)) {
    const rows = await waitForStored(account.store, 'private-group-174');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].body, 'Private group E2E test payload');
  }
  const delivered = relay.sentEnvelopes.filter(envelope => envelope.targetUserId !== 'rim-group-a');
  assert.equal(delivered.length, 2);
  assert.ok(delivered.every(envelope => envelope.ciphertext));
  assert.ok(delivered.every(envelope => !Object.hasOwn(envelope, 'body')));
  assert.equal(new Set(delivered.map(envelope => envelope.timestamp)).size, 2, 'each pairwise SDK send needs a unique device timestamp');
});

test('RIM runtime delivers encrypted fan-out to every private-channel participant', async t => {
  const relay = new InMemorySignalRelay();
  const accounts = await Promise.all(['rim-channel-a', 'rim-channel-b', 'rim-channel-c'].map(id => createRuntimeAccount(id, relay)));
  t.after(async () => Promise.all(accounts.map(account => account.runtime.dispose())));
  await Promise.all(accounts.map(account => account.runtime.startIncoming()));
  const members = ['rim-channel-a', 'rim-channel-b', 'rim-channel-c'];
  assert.ok(accounts.every(account => account.runtime.protocolReady === false), 'the in-memory relay must not be promoted to production readiness');

  const sent = await accounts[0].runtime.sendGroup(members, 'Private channel E2E test publication', {
    conversationId: 'private-channel-174', scopeType: 'private_channel', clientMessageId: 'channel-174-post-1'
  });
  assert.equal(sent.acceptedRecipientCount, 2);
  assert.equal(sent.failedRecipientCount, 0);
  for (const account of accounts.slice(1)) {
    const rows = await waitForStored(account.store, 'private-channel-174');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].body, 'Private channel E2E test publication');
  }
  const delivered = relay.sentEnvelopes.filter(envelope => envelope.targetUserId !== 'rim-channel-a');
  assert.equal(delivered.length, 2);
  assert.ok(delivered.every(envelope => envelope.ciphertext));
  assert.ok(delivered.every(envelope => !Object.hasOwn(envelope, 'body')));
  assert.equal(new Set(delivered.map(envelope => envelope.timestamp)).size, 2, 'each pairwise SDK send needs a unique device timestamp');
});
