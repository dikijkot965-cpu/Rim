import test from 'node:test';
import assert from 'node:assert/strict';
import { RimSignalProtocolRuntime } from '../src/security/e2e/signal-protocol-runtime.js';

function createProductionRelayHub() {
  const subscribers = new Map();
  const relays = new Map();
  const key = (user, device) => `${user}:${device}`;
  const makeRelay = userId => {
    const listeners = new Set();
    const relay = {
      isProductionRelay: true,
      relayConnectionState: { state: 'stopped', since: Date.now() },
      setState(state) { relay.relayConnectionState = { state, since: Date.now() }; for (const fn of listeners) fn(relay.relayConnectionState); },
      subscribeRelayConnectionState(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      async getDevices() { return []; },
      async registerDevice(_user, device) { return device.deviceId; },
      setCurrentDevice() {}, async removeDevice() {},
      async provisionIdentityKey() {}, async rotateIdentityKey() {}, async getIdentityKey() { return null; },
      async uploadPreKeys() {}, async fetchPreKeyBundle() { return null; }, async getPreKeyCount() { return 0; },
      async getPreKeyInventory() { return {}; }, async clearStaleKemPreKeys() {}, async publishPlannedPreKeys() {},
      async getActiveDevices() { return []; }, async getEcSignedPreKeyMetadata() { return null; }, async getKemLastResortPreKeyMetadata() { return null; },
      async markDelivered() {},
      subscribe(owner, deviceId, callback) { const id = key(owner, deviceId); subscribers.set(id, callback); relay.setState('connected'); return () => subscribers.delete(id); },
      async send(envelope) {
        const delivered = { ...envelope, messageId: `m-${Math.random()}`, timestamp: Date.now() };
        const callback = subscribers.get(key(envelope.targetUserId, envelope.targetDeviceId || 1));
        if (callback) await callback(delivered);
        return { messageId: delivered.messageId, clientTimestamp: delivered.timestamp };
      }
    };
    relays.set(userId, relay);
    return relay;
  };
  return { makeRelay };
}

function makeEnvironment() {
  return {
    isSecureContext: true,
    indexedDB: { open() {} },
    crypto: {
      subtle: { digest: async () => new Uint8Array(32).buffer },
      randomUUID: (() => { let n = 0; return () => `nonce-${++n}`; })()
    }
  };
}

test('protocolReady remains false on relay connection and turns true only after encrypted challenge/ack exchange', async () => {
  const hub = createProductionRelayHub();
  const runtimes = new Map();
  const makeRuntime = userId => {
    let relay;
    const runtime = new RimSignalProtocolRuntime({
      getUser: () => ({ id: userId }), environment: makeEnvironment(),
      authorizePeerVerification: async ({ senderUserId, localUserId }) => Boolean(senderUserId && localUserId && senderUserId !== localUserId),
      relayFactory: async () => (relay = hub.makeRelay(userId)),
      importSdk: async () => ({ createSignalProtocolClient: async ({ hooks, adapters, identity, deviceId }) => ({
        async syncToServer() {},
        startRelaySubscription() { relay.subscribe(identity.userId, deviceId, message => hooks.onMessageDecrypted(message)); },
        async send(targetUserId, content) { return relay.send({ senderId: identity.userId, targetUserId, targetDeviceId: 1, content }); },
        async stopRelaySubscription() {}, async stop() {}, async close() {}
      }) }),
      importWebSqliteStore: async () => ({ webSqliteStore: async () => ({ close() {}, hasIdentityKey: async () => false }) }),
      messageStore: { put: async () => {}, getConversation: async () => [] }
    });
    runtimes.set(userId, runtime);
    return runtime;
  };
  const alice = makeRuntime('alice');
  const bob = makeRuntime('bob');
  try {
    await alice.startIncoming();
    await bob.startIncoming();
    assert.equal(alice.protocolReady, false);
    assert.equal(bob.protocolReady, false);
    const result = await alice.verifyScopeExchange({ type: 'direct', id: 'secret-chat-1' }, ['alice', 'bob'], { timeoutMs: 5000 });
    assert.equal(result.verified, true);
    assert.equal(result.verifiedPeerCount, 1);
    assert.equal(alice.protocolReady, true);
    assert.equal(bob.protocolReady, true);
    assert.equal(alice.state, 'relay-verified');
    assert.equal(bob.state, 'relay-verified');
    assert.equal(alice.isScopeVerified({ type: 'direct', id: 'secret-chat-1' }), true);
    // The responder finishes its incoming SDK callback after the initiator's
    // ACK promise resolves; wait one turn before asserting the responder state.
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(bob.isScopeVerified({ type: 'direct', id: 'secret-chat-1' }), true, 'the direct-chat responder verifies the same bidirectional scope after its encrypted ACK is accepted');
  } finally {
    await Promise.all([...runtimes.values()].map(runtime => runtime.dispose()));
  }
});

test('scope readiness is granted only after every peer exchange and never leaks across scopes', async () => {
  const runtime = new RimSignalProtocolRuntime({ getUser: () => ({ id: 'user-a' }) });
  const peers = [];
  runtime.verifyPeerExchange = async (peer, id, options) => { peers.push([peer, id, options.scopeType]); return { verified: true, peerUserId: peer }; };
  await runtime.verifyScopeExchange({ type: 'group', id: 'group-1' }, ['user-a', 'user-b', 'user-c']);
  assert.deepEqual(peers, [['user-b', 'group-1', 'group'], ['user-c', 'group-1', 'group']]);
  assert.equal(runtime.isScopeVerified({ type: 'group', id: 'group-1' }), true);
  assert.equal(runtime.isScopeVerified({ type: 'direct', id: 'group-1' }), false);
  assert.equal(runtime.isScopeVerified({ type: 'group', id: 'group-2' }), false);
  await runtime.stop();
  assert.equal(runtime.isScopeVerified({ type: 'group', id: 'group-1' }), false);
});

test('a group scope is not marked verified until every member completes the exchange', async t => {
  const hub = createProductionRelayHub();
  const runtimes = new Map();
  const makeRuntime = userId => {
    let relay;
    const runtime = new RimSignalProtocolRuntime({
      getUser: () => ({ id: userId }), environment: makeEnvironment(),
      authorizePeerVerification: async ({ senderUserId, localUserId }) => Boolean(senderUserId && localUserId && senderUserId !== localUserId),
      relayFactory: async () => (relay = hub.makeRelay(userId)),
      importSdk: async () => ({ createSignalProtocolClient: async ({ hooks, identity, deviceId }) => ({
        async syncToServer() {},
        startRelaySubscription() { relay.subscribe(identity.userId, deviceId, message => hooks.onMessageDecrypted(message)); },
        async send(targetUserId, content) { return relay.send({ senderId: identity.userId, targetUserId, targetDeviceId: 1, content }); },
        async stopRelaySubscription() {}, async stop() {}, async close() {}
      }) }),
      importWebSqliteStore: async () => ({ webSqliteStore: async () => ({ close() {}, hasIdentityKey: async () => false }) }),
      messageStore: { put: async () => {}, getConversation: async () => [] }
    });
    runtimes.set(userId, runtime);
    return runtime;
  };
  const alice = makeRuntime('alice');
  const bob = makeRuntime('bob');
  const charlie = makeRuntime('charlie');
  try {
    await Promise.all([alice.startIncoming(), bob.startIncoming(), charlie.startIncoming()]);
    await alice.verifyScopeExchange({ type: 'group', id: 'group-1' }, ['alice', 'bob', 'charlie'], { timeoutMs: 5000 });
    assert.equal(alice.isScopeVerified({ type: 'group', id: 'group-1' }), true);
    assert.equal(bob.protocolReady, true);
    assert.equal(bob.isScopeVerified({ type: 'group', id: 'group-1' }), false, 'one received challenge must not certify the whole group');
    await bob.verifyScopeExchange({ type: 'group', id: 'group-1' }, ['alice', 'bob', 'charlie'], { timeoutMs: 5000 });
    assert.equal(bob.isScopeVerified({ type: 'group', id: 'group-1' }), true);
  } finally {
    await Promise.all([...runtimes.values()].map(runtime => runtime.dispose()));
  }
});


test('incoming direct verification challenge is not acknowledged or trusted unless sender belongs to that exact scope', async () => {
  const hub = createProductionRelayHub();
  let aliceRelay;
  let bobRelay;
  const makeRuntime = (userId, authorizePeerVerification) => {
    let relay;
    const runtime = new RimSignalProtocolRuntime({
      getUser: () => ({ id: userId }), environment: makeEnvironment(), authorizePeerVerification,
      relayFactory: async () => (relay = hub.makeRelay(userId)),
      importSdk: async () => ({ createSignalProtocolClient: async ({ hooks, adapters, identity, deviceId }) => ({
        async syncToServer() {},
        startRelaySubscription() { relay.subscribe(identity.userId, deviceId, message => hooks.onMessageDecrypted(message)); },
        async send(targetUserId, content) { return relay.send({ senderId: identity.userId, targetUserId, targetDeviceId: 1, content }); },
        async stopRelaySubscription() {}, async stop() {}, async close() {}
      }) }),
      importWebSqliteStore: async () => ({ webSqliteStore: async () => ({ close() {}, hasIdentityKey: async () => false }) }),
      messageStore: { put: async () => {}, getConversation: async () => [] }
    });
    if (userId === 'alice') aliceRelay = relay;
    else bobRelay = relay;
    return runtime;
  };
  const alice = makeRuntime('alice', async () => true);
  const bob = makeRuntime('bob', async () => false);
  try {
    await Promise.all([alice.startIncoming(), bob.startIncoming()]);
    await assert.rejects(() => alice.verifyPeerExchange('bob', 'secret-chat-rejected', { timeoutMs: 1000 }), /Истекло время ожидания/);
    assert.equal(alice.isScopeVerified({ type: 'direct', id: 'secret-chat-rejected' }), false);
    assert.equal(bob.isScopeVerified({ type: 'direct', id: 'secret-chat-rejected' }), false);
  } finally {
    await Promise.all([alice.dispose(), bob.dispose()]);
  }
});
