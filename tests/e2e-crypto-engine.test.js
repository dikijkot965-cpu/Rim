import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { RimE2ECryptoEngine } from '../src/security/e2e/crypto-engine.js';

test('RIM E2E engine encrypts a direct message into sender and recipient envelopes', async () => {
  const engine = new RimE2ECryptoEngine({ cryptoRef: webcrypto });
  const alice = await engine.createIdentity(); const bob = await engine.createIdentity();
  const payload = await engine.encryptDirectMessage('секретное сообщение', {
    senderIdentity: alice, recipientPublicKey: bob.publicKey,
    conversationId: 'conversation-1', senderId: 'alice', recipientId: 'bob', messageId: 'message-1'
  });
  assert.equal(payload.type, 'rim.e2e.experimental.v1');
  assert.equal(await engine.verifyDirectMessage(payload), true);
  assert.equal(await engine.decryptDirectMessage(payload, { identity: bob, userId: 'bob', conversationId: 'conversation-1', senderId: 'alice', recipientId: 'bob', messageId: 'message-1' }), 'секретное сообщение');
  assert.equal(await engine.decryptDirectMessage(payload, { identity: alice, userId: 'alice', conversationId: 'conversation-1', senderId: 'alice', recipientId: 'bob', messageId: 'message-1' }), 'секретное сообщение');
});

test('RIM E2E rejects altered ciphertext and wrong conversation context', async () => {
  const engine = new RimE2ECryptoEngine({ cryptoRef: webcrypto });
  const alice = await engine.createIdentity(); const bob = await engine.createIdentity();
  const payload = await engine.encryptDirectMessage('private', { senderIdentity: alice, recipientPublicKey: bob.publicKey, conversationId: 'c1', senderId: 'a', recipientId: 'b', messageId: 'm1' });
  await assert.rejects(() => engine.decryptDirectMessage(payload, { identity: bob, userId: 'b', conversationId: 'c2', senderId: 'a', recipientId: 'b', messageId: 'm1' }));
  const altered = structuredClone(payload); altered.envelopes.b.ct = altered.envelopes.b.ct.slice(0, -2) + 'AA';
  await assert.rejects(() => engine.decryptDirectMessage(altered, { identity: bob, userId: 'b', conversationId: 'c1', senderId: 'a', recipientId: 'b', messageId: 'm1' }));
});


test('RIM E2E signs the envelope and rejects tampering with sender identity or envelope metadata', async () => {
  const engine = new RimE2ECryptoEngine({ cryptoRef: webcrypto });
  const alice = await engine.createIdentity(); const bob = await engine.createIdentity();
  const payload = await engine.encryptDirectMessage('signed payload', { senderIdentity: alice, recipientPublicKey: bob.publicKey, conversationId: 'c', senderId: 'a', recipientId: 'b', messageId: 'm' });
  assert.equal(await engine.verifyDirectMessage(payload), true);
  const changed = structuredClone(payload); changed.signer = (await engine.createIdentity()).signPublicKey;
  assert.equal(await engine.verifyDirectMessage(changed), false);
  await assert.rejects(() => engine.decryptDirectMessage(changed, { identity:bob, userId:'b', conversationId:'c', senderId:'a', recipientId:'b', messageId:'m' }));
});

test('RIM E2E signed prekeys are bound to the device signing identity', async () => {
  const engine = new RimE2ECryptoEngine({ cryptoRef: webcrypto });
  const alice = await engine.createIdentity();
  const signed = await engine.createSignedPrekey(alice, 42);
  assert.equal(await engine.verifySignedPrekey(alice.signPublicKey, signed), true);
  assert.equal(await engine.verifySignedPrekey((await engine.createIdentity()).signPublicKey, signed), false);
});
