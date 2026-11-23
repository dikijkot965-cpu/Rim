import test from 'node:test';
import assert from 'node:assert/strict';
import { RimSignalProtocolRuntime } from '../src/security/e2e/signal-protocol-runtime.js';

function relay() {
  const calls = [];
  return {
    calls,
    relayConnectionState: { state: 'connected', since: Date.now() },
    async getDevices() { return []; },
    async registerDevice(_user, device) { return device.deviceId; },
    setCurrentDevice() {},
    async send(envelope) { calls.push(envelope); return { messageId: `m-${calls.length}`, clientTimestamp: Date.now() }; },
    async subscribe() {}, async markDelivered() {}, async removeDevice() {},
    async provisionIdentityKey() {}, async rotateIdentityKey() {}, async getIdentityKey() { return null; },
    async uploadPreKeys() {}, async fetchPreKeyBundle() { return null; }, async getPreKeyCount() { return 0; },
    async getPreKeyInventory() { return {}; }, async clearStaleKemPreKeys() {}, async publishPlannedPreKeys() {},
    async getActiveDevices() { return []; }, async getEcSignedPreKeyMetadata() { return null; }, async getKemLastResortPreKeyMetadata() { return null; },
    subscribeRelayConnectionState() { return () => {}; }
  };
}

test('group fan-out encrypts separately for each member and persists one local copy', async () => {
  const transport = relay();
  const stored = [];
  const runtime = new RimSignalProtocolRuntime({
    getUser: () => ({ id: 'user-a' }),
    environment: { isSecureContext: true, indexedDB: { open() {} }, crypto: { subtle: { digest: async () => new Uint8Array(32).buffer }, randomUUID: () => 'operation-1' } },
    relayFactory: async () => transport,
    importSdk: async () => ({ createSignalProtocolClient: async () => ({ send: async (recipient, content, options) => ({ messageId: `to-${recipient}`, clientTimestamp: options.timestamp }) }) }),
    importWebSqliteStore: async () => ({ webSqliteStore: async () => ({ close() {}, hasIdentityKey: async () => false }) }),
    messageStore: { put: async message => stored.push(message), getConversation: async () => [] }
  });
  try {
    const result = await runtime.sendGroup(['user-b', 'user-c', 'user-b', 'user-a'], 'private group message', { conversationId: 'group-1' });
    assert.equal(result.acceptedRecipientCount, 2);
    assert.equal(result.failedRecipientCount, 0);
    assert.equal(stored.length, 1);
    assert.deepEqual(stored[0].recipientId, 'user-b,user-c');
  } finally { await runtime.dispose(); }
});
