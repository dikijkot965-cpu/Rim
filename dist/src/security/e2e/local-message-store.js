const DB_NAME_PREFIX = 'rim-e2e-content-';
const DB_VERSION = 1;
const KEY_STORE = 'keys';
const MESSAGE_STORE = 'messages';
const CONTENT_KEY_ID = 'content-key-v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('E2E local message database request failed.'));
  });
}
function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('E2E local message transaction failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('E2E local message transaction aborted.'));
  });
}
function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
  return btoa(binary);
}
function fromBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
function aad(conversationId, messageId) {
  return encoder.encode(`RIM-E2E-LOCAL-CONTENT-v1|${conversationId}|${messageId}`);
}

/** Device-local encrypted cache for already-decrypted chat content. It is not a protocol store. */
export class RimE2ELocalMessageStore {
  constructor({ indexedDBRef = globalThis.indexedDB, cryptoRef = globalThis.crypto, getUser = null, userId = null } = {}) {
    if (!indexedDBRef?.open || !cryptoRef?.subtle || !cryptoRef?.getRandomValues) {
      throw new Error('Encrypted E2E local message storage requires IndexedDB and Web Crypto.');
    }
    this.indexedDB = indexedDBRef;
    this.crypto = cryptoRef;
    this.getUser = getUser;
    this.userId = userId ? String(userId) : null;
    this.dbUserId = null;
    this.dbName = null;
    this.dbPromise = null;
    this.keyPromise = null;
    this.keyPromiseUserId = null;
  }

  async #currentUserId() {
    const userId = String(this.userId || this.getUser?.()?.id || '');
    if (!userId) throw new Error('Для локальной E2E-истории требуется авторизованный пользователь.');
    return userId;
  }

  async open(expectedUserId = null) {
    const userId = await this.#currentUserId();
    if (expectedUserId && userId !== String(expectedUserId)) {
      throw new Error('Аккаунт изменился во время операции с локальной E2E-историей. Операция остановлена.');
    }
    if (this.dbPromise && this.dbUserId === userId) {
      const pending = this.dbPromise;
      const db = await pending;
      if (String(this.getUser?.()?.id || this.userId || '') !== userId) {
        throw new Error('Аккаунт изменился при открытии локальной E2E-базы.');
      }
      return db;
    }
    if (this.dbPromise && this.dbUserId !== userId) {
      const previous = this.dbPromise;
      this.dbPromise = null;
      this.keyPromise = null;
      this.keyPromiseUserId = null;
      try { (await previous).close(); } catch { /* best effort during account switch */ }
    }
    this.dbUserId = userId;
    const digest = await this.crypto.subtle.digest('SHA-256', encoder.encode(userId));
    if (String(this.getUser?.()?.id || this.userId || '') !== userId) {
      throw new Error('Аккаунт изменился при подготовке локальной E2E-базы.');
    }
    const suffix = Array.from(new Uint8Array(digest).slice(0, 12), byte => byte.toString(16).padStart(2, '0')).join('');
    const dbName = `${DB_NAME_PREFIX}${suffix}`;
    this.dbName = dbName;
    const pending = new Promise((resolve, reject) => {
      const request = this.indexedDB.open(dbName, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(MESSAGE_STORE)) {
          const messages = db.createObjectStore(MESSAGE_STORE, { keyPath: 'messageId' });
          messages.createIndex('conversationId', 'conversationId', { unique: false });
          messages.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open E2E local message database.'));
      request.onblocked = () => reject(new Error('E2E local message database is blocked by another tab.'));
    });
    this.dbPromise = pending;
    const db = await pending;
    const currentUserId = String(this.getUser?.()?.id || this.userId || '');
    if (currentUserId !== userId || (expectedUserId && currentUserId !== String(expectedUserId))) {
      try { db.close(); } catch { /* ignore stale connection */ }
      if (this.dbPromise === pending) {
        this.dbPromise = null;
        this.dbUserId = null;
        this.keyPromise = null;
        this.keyPromiseUserId = null;
      }
      throw new Error('Аккаунт изменился при открытии локальной E2E-базы.');
    }
    return db;
  }

  async #getContentKey(expectedUserId = null) {
    const userId = String(expectedUserId || await this.#currentUserId());
    if (String(await this.#currentUserId()) !== userId) throw new Error('Аккаунт изменился перед получением ключа локальной E2E-истории.');
    if (this.keyPromise && this.keyPromiseUserId === userId) return this.keyPromise;
    const pending = (async () => {
      const db = await this.open(userId);
      const readTx = db.transaction(KEY_STORE, 'readonly');
      const existing = await requestResult(readTx.objectStore(KEY_STORE).get(CONTENT_KEY_ID));
      if (String(await this.#currentUserId()) !== userId) throw new Error('Аккаунт изменился при чтении ключа локальной E2E-истории.');
      if (existing?.key) return existing.key;
      const key = await this.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      if (String(await this.#currentUserId()) !== userId) throw new Error('Аккаунт изменился при создании ключа локальной E2E-истории.');
      const writeTx = db.transaction(KEY_STORE, 'readwrite');
      writeTx.objectStore(KEY_STORE).put({ id: CONTENT_KEY_ID, key, createdAt: Date.now() });
      await transactionDone(writeTx);
      return key;
    })();
    this.keyPromise = pending;
    this.keyPromiseUserId = userId;
    try {
      const key = await pending;
      if (String(await this.#currentUserId()) !== userId) throw new Error('Аккаунт изменился после получения ключа локальной E2E-истории.');
      return key;
    } catch (error) {
      if (this.keyPromise === pending) {
        this.keyPromise = null;
        this.keyPromiseUserId = null;
      }
      throw error;
    }
  }

  async put(message, { expectedUserId = null } = {}) {
    const userId = await this.#currentUserId();
    if (expectedUserId && userId !== String(expectedUserId)) throw new Error('Аккаунт не совпадает с владельцем E2E-сообщения.');
    const conversationId = String(message?.conversationId || '');
    const messageId = String(message?.messageId || '');
    if (!conversationId || !messageId || conversationId.length > 128 || messageId.length > 128) {
      throw new Error('E2E local message requires bounded conversation and message identifiers.');
    }
    const content = {
      body: String(message.body ?? ''),
      senderId: String(message.senderId || ''),
      recipientId: String(message.recipientId || ''),
      direction: message.direction === 'outgoing' ? 'outgoing' : 'incoming',
      replyTo: message.replyTo ? String(message.replyTo) : null,
      timestamp: Number.isFinite(message.timestamp) ? Number(message.timestamp) : Date.now(),
    };
    const iv = this.crypto.getRandomValues(new Uint8Array(12));
    const key = await this.#getContentKey(userId);
    if (String(await this.#currentUserId()) !== userId) throw new Error('Аккаунт изменился перед шифрованием локальной E2E-истории.');
    const encrypted = await this.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad(conversationId, messageId), tagLength: 128 },
      key,
      encoder.encode(JSON.stringify(content)),
    );
    if (String(await this.#currentUserId()) !== userId) throw new Error('Аккаунт изменился во время шифрования локальной E2E-истории. Запись отменена.');
    const db = await this.open(userId);
    const tx = db.transaction(MESSAGE_STORE, 'readwrite');
    tx.objectStore(MESSAGE_STORE).put({
      messageId, conversationId, timestamp: content.timestamp,
      iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(encrypted)),
      createdAt: Date.now(), version: 1,
    });
    await transactionDone(tx);
    if (String(await this.#currentUserId()) !== userId) throw new Error('Аккаунт изменился после записи локальной E2E-истории.');
    return { messageId, conversationId, ...content };
  }

  async acceptIncoming(envelope, { expectedUserId = null } = {}) {
    let content;
    try { content = JSON.parse(String(envelope?.content || '')); } catch { return null; }
    if (!content || content.type !== 'rim.chat.text.v1' || !content.conversationId || typeof content.body !== 'string') return null;
    return this.put({
      messageId: envelope.messageId,
      conversationId: content.conversationId,
      body: content.body,
      senderId: envelope.senderId,
      recipientId: content.recipientId || '',
      replyTo: content.replyTo || null,
      timestamp: Number(content.timestamp || envelope.timestamp || Date.now()),
      direction: 'incoming',
    }, { expectedUserId });
  }

  async getConversation(conversationId, { limit = 200, expectedUserId = null } = {}) {
    const id = String(conversationId || '');
    if (!id) return [];
    const userId = await this.#currentUserId();
    if (expectedUserId && userId !== String(expectedUserId)) throw new Error('Аккаунт не совпадает с владельцем запрашиваемой E2E-истории.');
    const db = await this.open(userId);
    const tx = db.transaction(MESSAGE_STORE, 'readonly');
    const rows = await requestResult(tx.objectStore(MESSAGE_STORE).index('conversationId').getAll(id));
    const key = await this.#getContentKey(userId);
    const messages = [];
    for (const row of rows.sort((a, b) => Number(a.timestamp) - Number(b.timestamp)).slice(-Math.max(1, Math.min(500, limit)))) {
      if (String(await this.#currentUserId()) !== userId) throw new Error('Аккаунт изменился при чтении локальной E2E-истории.');
      let plaintext;
      try {
        plaintext = await this.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: fromBase64(row.iv), additionalData: aad(row.conversationId, row.messageId), tagLength: 128 },
          key,
          fromBase64(row.ciphertext),
        );
      } catch {
        // A damaged or mismatched local row is skipped; it never falls back to plaintext.
        continue;
      }
      if (String(await this.#currentUserId()) !== userId) throw new Error('Аккаунт изменился при расшифровке локальной E2E-истории.');
      messages.push({ messageId: row.messageId, conversationId: row.conversationId, ...JSON.parse(decoder.decode(plaintext)) });
    }
    return messages;
  }

  async removeConversation(conversationId) {
    const db = await this.open();
    const tx = db.transaction(MESSAGE_STORE, 'readwrite');
    const store = tx.objectStore(MESSAGE_STORE);
    const rows = await requestResult(store.index('conversationId').getAllKeys(String(conversationId)));
    for (const key of rows) store.delete(key);
    await transactionDone(tx);
    return rows.length;
  }

  async clear() {
    const db = await this.open();
    const tx = db.transaction([KEY_STORE, MESSAGE_STORE], 'readwrite');
    tx.objectStore(KEY_STORE).clear();
    tx.objectStore(MESSAGE_STORE).clear();
    await transactionDone(tx);
    this.keyPromise = null;
  }

  close() {
    this.dbPromise?.then(db => db.close()).catch(() => {});
    this.dbPromise = null;
    this.keyPromise = null;
    this.keyPromiseUserId = null;
    this.dbUserId = null;
    this.dbName = null;
  }
}

export const __localMessageStoreInternals = Object.freeze({ toBase64, fromBase64, aad });
