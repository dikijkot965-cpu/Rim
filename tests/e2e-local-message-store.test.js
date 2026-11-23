import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { RimE2ELocalMessageStore } from '../src/security/e2e/local-message-store.js';

class FakeStore {
  constructor() { this.rows = new Map(); this.indexes = new Set(); }
  createIndex(name) { this.indexes.add(name); }
  put(row) { this.rows.set(row.messageId ?? row.id, row); return makeRequest(row); }
  get(key) { return makeRequest(this.rows.get(key)); }
  getAll() { return makeRequest([...this.rows.values()]); }
  getAllKeys() { return makeRequest([...this.rows.keys()]); }
  delete(key) { this.rows.delete(key); return makeRequest(undefined); }
  clear() { this.rows.clear(); return makeRequest(undefined); }
  index(name) {
    return {
      getAll: value => makeRequest([...this.rows.values()].filter(row => row[name] === value)),
      getAllKeys: value => makeRequest([...this.rows.values()].filter(row => row[name] === value).map(row => row.messageId)),
    };
  }
}
function makeRequest(result) {
  const request = { result, error: null };
  setTimeout(() => request.onsuccess?.(), 0);
  return request;
}
class FakeDatabase {
  constructor() {
    this.stores = new Map();
    this.objectStoreNames = { contains: name => this.stores.has(name) };
  }
  createObjectStore(name) { const store = new FakeStore(); this.stores.set(name, store); return store; }
  transaction(names) {
    const tx = this;
    const list = Array.isArray(names) ? names : [names];
    const transaction = { error: null, objectStore(name) { if (!list.includes(name)) throw new Error('store not in transaction'); return tx.stores.get(name); } };
    setTimeout(() => transaction.oncomplete?.(), 0);
    return transaction;
  }
  close() {}
}
class FakeIndexedDB {
  constructor() { this.dbs = new Map(); }
  open(name) {
    if (!this.dbs.has(name)) this.dbs.set(name, new FakeDatabase());
    const request = { result: this.dbs.get(name), error: null };
    setTimeout(() => { request.onupgradeneeded?.(); request.onsuccess?.(); }, 0);
    return request;
  }
}

test('E2E local message store encrypts decrypted chat text before writing IndexedDB', async () => {
  const indexedDBRef = new FakeIndexedDB();
  const store = new RimE2ELocalMessageStore({ indexedDBRef, cryptoRef: webcrypto, userId: 'user-a' });
  const saved = await store.put({
    messageId: 'message-1', conversationId: 'conversation-1', body: 'секретный текст',
    senderId: 'user-a', recipientId: 'user-b', direction: 'outgoing', timestamp: 123,
  });
  assert.equal(saved.body, 'секретный текст');
  const raw = indexedDBRef.dbs.values().next().value.stores.get('messages').rows.get('message-1');
  assert.ok(raw.ciphertext);
  assert.equal(JSON.stringify(raw).includes('секретный текст'), false);
  const restored = await store.getConversation('conversation-1');
  assert.equal(restored.length, 1);
  assert.equal(restored[0].body, 'секретный текст');
  assert.equal(restored[0].direction, 'outgoing');
});

test('E2E local message store accepts only the RIM encrypted text envelope format', async () => {
  const store = new RimE2ELocalMessageStore({ indexedDBRef: new FakeIndexedDB(), cryptoRef: webcrypto, userId: 'user-a' });
  const accepted = await store.acceptIncoming({
    messageId: 'message-2', senderId: 'user-b', timestamp: 456,
    content: JSON.stringify({ type: 'rim.chat.text.v1', version: 1, conversationId: 'conversation-2', body: 'Привет', recipientId: 'user-a', timestamp: 456 }),
  });
  assert.equal(accepted.body, 'Привет');
  assert.equal(accepted.direction, 'incoming');
  assert.equal(await store.acceptIncoming({ messageId: 'bad', content: 'not-json' }), null);
  assert.equal(await store.acceptIncoming({ messageId: 'bad-2', content: JSON.stringify({ type: 'other', body: 'no' }) }), null);
});

test('E2E local content databases are isolated by authenticated account', async () => {
  const indexedDBRef = new FakeIndexedDB();
  let currentUser = 'alice';
  const store = new RimE2ELocalMessageStore({ indexedDBRef, cryptoRef: webcrypto, getUser: () => ({ id: currentUser }) });
  await store.put({ messageId: 'same-id', conversationId: 'same-conversation', body: 'Alice', senderId: 'alice', direction: 'outgoing' });
  const aliceDbName = store.dbName;
  currentUser = 'bob';
  await store.put({ messageId: 'same-id', conversationId: 'same-conversation', body: 'Bob', senderId: 'bob', direction: 'outgoing' });
  const bobDbName = store.dbName;
  assert.notEqual(aliceDbName, bobDbName);
  assert.equal((await store.getConversation('same-conversation'))[0].body, 'Bob');
  assert.equal(indexedDBRef.dbs.size, 2);
});

test('E2E local message write aborts if the authenticated account changes during encryption', async () => {
  const indexedDBRef = new FakeIndexedDB();
  let currentUser = 'alice';
  const cryptoRef = {
    getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
    subtle: {
      digest: webcrypto.subtle.digest.bind(webcrypto.subtle),
      generateKey: webcrypto.subtle.generateKey.bind(webcrypto.subtle),
      encrypt: async (...args) => {
        const encrypted = await webcrypto.subtle.encrypt(...args);
        currentUser = 'bob';
        return encrypted;
      },
      decrypt: webcrypto.subtle.decrypt.bind(webcrypto.subtle)
    }
  };
  const store = new RimE2ELocalMessageStore({ indexedDBRef, cryptoRef, getUser: () => ({ id: currentUser }) });
  await assert.rejects(() => store.put({
    messageId: 'race-message', conversationId: 'race-chat', body: 'Alice private content', senderId: 'alice', direction: 'incoming'
  }, { expectedUserId: 'alice' }), /Аккаунт изменился во время шифрования/);
  assert.equal(indexedDBRef.dbs.size, 1);
  const db = indexedDBRef.dbs.values().next().value;
  assert.equal(db.stores.get('messages').rows.size, 0);
});

test('incoming E2E envelope is rejected when its SDK account no longer matches the active account', async () => {
  const indexedDBRef = new FakeIndexedDB();
  let currentUser = 'bob';
  const store = new RimE2ELocalMessageStore({ indexedDBRef, cryptoRef: webcrypto, getUser: () => ({ id: currentUser }) });
  await assert.rejects(() => store.acceptIncoming({
    messageId: 'old-account-message', senderId: 'peer',
    content: JSON.stringify({ type: 'rim.chat.text.v1', version: 1, conversationId: 'chat', body: 'Alice content' })
  }, { expectedUserId: 'alice' }), /не совпадает с владельцем E2E-сообщения/);
  assert.equal(indexedDBRef.dbs.size, 0);
});

test('E2E local history read aborts rather than returning old-account plaintext after an auth switch', async () => {
  const indexedDBRef = new FakeIndexedDB();
  let currentUser = 'alice';
  const store = new RimE2ELocalMessageStore({ indexedDBRef, cryptoRef: webcrypto, getUser: () => ({ id: currentUser }) });
  await store.put({ messageId: 'history-race', conversationId: 'chat', body: 'Alice-only', senderId: 'alice', direction: 'incoming' });
  const decrypt = webcrypto.subtle.decrypt.bind(webcrypto.subtle);
  const cryptoRef = {
    getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
    subtle: {
      digest: webcrypto.subtle.digest.bind(webcrypto.subtle),
      generateKey: webcrypto.subtle.generateKey.bind(webcrypto.subtle),
      encrypt: webcrypto.subtle.encrypt.bind(webcrypto.subtle),
      decrypt: async (...args) => {
        const plaintext = await decrypt(...args);
        currentUser = 'bob';
        return plaintext;
      }
    }
  };
  const racingStore = new RimE2ELocalMessageStore({ indexedDBRef, cryptoRef, getUser: () => ({ id: currentUser }) });
  // The second store uses the same account database/key; only the active identity changes during decryption.
  await assert.rejects(() => racingStore.getConversation('chat', { expectedUserId: 'alice' }), /Аккаунт изменился при расшифровке/);
});
