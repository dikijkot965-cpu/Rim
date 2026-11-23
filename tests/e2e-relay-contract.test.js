import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectSignalRelayContract } from '../src/security/e2e/signal-protocol-runtime.js';

test('E2E relay contract rejects missing production capabilities', () => {
  const result = inspectSignalRelayContract({ send() {}, subscribe() {} });
  assert.equal(result.valid, false);
  assert.ok(result.missing.includes('fetchPreKeyBundle'));
  assert.ok(result.missing.includes('relayConnectionState'));
});

test('E2E relay contract accepts a complete required SDK surface', () => {
  const names = [
    'send', 'subscribe', 'subscribeRelayConnectionState', 'markDelivered',
    'getDevices', 'registerDevice', 'setCurrentDevice', 'removeDevice', 'provisionIdentityKey',
    'rotateIdentityKey', 'getIdentityKey', 'uploadPreKeys', 'fetchPreKeyBundle',
    'getPreKeyCount', 'getPreKeyInventory', 'clearStaleKemPreKeys',
    'publishPlannedPreKeys', 'getActiveDevices', 'getEcSignedPreKeyMetadata',
    'getKemLastResortPreKeyMetadata'
  ];
  const relay = Object.fromEntries(names.map(name => [name, () => {}]));
  relay.relayConnectionState = { state: 'stopped', since: 0 };
  assert.deepEqual(inspectSignalRelayContract(relay), { valid: true, missing: [] });
});
