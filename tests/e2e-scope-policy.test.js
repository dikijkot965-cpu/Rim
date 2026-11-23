import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeE2EScope, evaluateE2EReadiness, assertEncryptedMessageEnvelope, E2E_PROTOCOL_PROFILE } from '../src/security/e2e/scope-policy.js';

test('E2E scope policy permits direct chats and private groups only', () => {
  assert.equal(normalizeE2EScope({ type: 'direct', id: 'd1' }).eligible, true);
  assert.equal(normalizeE2EScope({ type: 'group', id: 'g1', is_private: true }).eligible, true);
  assert.equal(normalizeE2EScope({ type: 'group', id: 'g2', is_private: false }).eligible, false);
});

test('E2E scope policy rejects public channels and unknown privacy state', () => {
  assert.equal(normalizeE2EScope({ type: 'channel', id: 'c1', is_public: true }).eligible, false);
  assert.equal(normalizeE2EScope({ type: 'channel', id: 'c2' }).eligible, false);
  assert.equal(normalizeE2EScope({ type: 'channel', id: 'c3', is_public: false }).eligible, true);
});

test('E2E readiness requires protocol integration and compatible active devices for every member', () => {
  const scope = { type: 'group', id: 'g1', is_private: true };
  const members = [{ user_id: 'a' }, { user_id: 'b' }];
  const devices = [
    { user_id: 'a', status: 'active', algorithm_suite: E2E_PROTOCOL_PROFILE },
    { user_id: 'b', status: 'active', algorithm_suite: E2E_PROTOCOL_PROFILE }
  ];
  assert.equal(evaluateE2EReadiness({ scope, members, devices, protocolReady: false }).ready, false);
  assert.equal(evaluateE2EReadiness({ scope, members, devices, protocolReady: true }).ready, true);
  assert.deepEqual(evaluateE2EReadiness({ scope, members, devices: devices.slice(0, 1), protocolReady: true }).missingUserIds, ['b']);
});

test('E2E message guard rejects plaintext and missing envelopes', () => {
  const scope = { type: 'direct', id: 'd1' };
  assert.throws(() => assertEncryptedMessageEnvelope({ body: 'hello' }, { scope, protocolReady: true }), /отсутствует корректный/);
  assert.throws(() => assertEncryptedMessageEnvelope({ body: 'hello', encryption_version: 1, encrypted_payload: { v: 1 } }, { scope, protocolReady: true }), /открытый текст/);
  assert.equal(assertEncryptedMessageEnvelope({ body: '', encryption_version: 1, encrypted_payload: { v: 1 } }, { scope, protocolReady: true }), true);
});
