/**
 * OpenE2EE Signal Protocol SDK adapter for the browser runtime.
 *
 * Direct chats, private groups and private channels use pairwise Signal SDK
 * fan-out and a device-local encrypted timeline. A scope is ready only after
 * a real production challenge/ack exchange has been verified for its members.
 */
const REQUIRED_RELAY_METHODS = Object.freeze([
  'send', 'subscribe', 'subscribeRelayConnectionState', 'markDelivered',
  'getDevices', 'registerDevice', 'setCurrentDevice', 'removeDevice', 'provisionIdentityKey',
  'rotateIdentityKey', 'getIdentityKey', 'uploadPreKeys', 'fetchPreKeyBundle',
  'getPreKeyCount', 'getPreKeyInventory', 'clearStaleKemPreKeys',
  'publishPlannedPreKeys', 'getActiveDevices', 'getEcSignedPreKeyMetadata',
  'getKemLastResortPreKeyMetadata'
]);

/** Reject partial/mock transports before the SDK can mistake them for a relay. */
export function inspectSignalRelayContract(relay) {
  if (!relay || typeof relay !== 'object') return { valid: false, missing: [...REQUIRED_RELAY_METHODS, 'relayConnectionState'] };
  const missing = REQUIRED_RELAY_METHODS.filter(name => typeof relay[name] !== 'function');
  const connection = relay.relayConnectionState;
  if (!connection || typeof connection !== 'object' || !['stopped', 'connecting', 'connected', 'reconnecting'].includes(connection.state) || !Number.isFinite(connection.since)) missing.push('relayConnectionState');
  return { valid: missing.length === 0, missing };
}

export class RimSignalProtocolRuntime {
  constructor({ getUser, relayFactory = null, messageStore = null, onDecryptedMessage = null, onOutgoingMessage = null, authorizePeerVerification = null, diagnostics = null, logger = null,
    importSdk = () => import('@open-e2ee/signal-protocol-sdk'),
    importWebSqliteStore = () => import('@open-e2ee/signal-protocol-sdk/local/store/web-sqlite'),
    importWebStore = () => import('@open-e2ee/signal-protocol-sdk/local/store/web'), environment = globalThis } = {}) {
    this.getUser = getUser;
    this.relayFactory = relayFactory;
    this.onDecryptedMessage = onDecryptedMessage;
    this.onOutgoingMessage = onOutgoingMessage;
    this.authorizePeerVerification = authorizePeerVerification;
    this.diagnostics = diagnostics;
    this.messageStore = messageStore;
    this.logger = logger;
    this.importSdk = importSdk;
    this.importWebSqliteStore = importWebSqliteStore;
    this.importWebStore = importWebStore;
    this.environment = environment;
    this.client = null;
    this.storage = null;
    this.relay = null;
    this.userId = null;
    this.deviceId = 1;
    this.lastSentTimestamp = 0;
    this.initializing = null;
    this.incomingStarting = null;
    this.incomingClient = null;
    this.disposing = null;
    // Invalidates any in-flight initialization/startup when the runtime is
    // explicitly disposed, even if the authenticated account did not change.
    this.lifecycleGeneration = 0;
    this.pendingPeerVerifications = new Map();
    this.relayStateUnsubscribe = null;
    this.verifiedScopes = new Set();
    this.state = 'stopped';
    this.protocolReady = false;
  }

  async initialize() {
    // A caller must never open a new SDK client while a previous client's
    // stop/close sequence is still running.
    if (this.disposing) await this.disposing.catch(() => {});
    if (this.initializing) {
      const pending = this.initializing;
      await pending.catch(() => {});
      const activeUserId = String(this.getUser?.()?.id || '');
      if (this.client && this.userId === activeUserId) return this.client;
      // Another waiter may already have started initialization for the newly
      // active account. Join it instead of opening a second SDK/store pair.
      if (this.initializing && this.initializing !== pending) return this.initialize();
    }
    const requestedUserId = String(this.getUser?.()?.id || '');
    if (!requestedUserId) throw new Error('Для E2E требуется авторизация в РИМ.');
    if (this.client && this.userId !== requestedUserId) await this.dispose();
    if (this.disposing) await this.disposing.catch(() => {});
    if (this.client && this.userId === requestedUserId) return this.client;
    // Re-check after disposal because another caller may have started a new
    // initialization while stop/close awaited asynchronous SDK work.
    if (this.initializing) return this.initialize();
    const generation = this.lifecycleGeneration;
    const task = this.#initialize(requestedUserId, generation);
    this.initializing = task;
    try {
      const result = await task;
      void this.diagnostics?.record?.('runtime_start', { status: 'success', deviceId: this.deviceId, metadata: { state: this.state } });
      return result;
    } catch (error) {
      void this.diagnostics?.record?.('runtime_error', { status: 'error', code: 'initialize_failed', deviceId: this.deviceId, metadata: { phase: 'initialize' } });
      throw error;
    } finally { if (this.initializing === task) this.initializing = null; }
  }

  #assertActiveAccount(userId, phase, generation = this.lifecycleGeneration) {
    if (generation !== this.lifecycleGeneration) {
      throw new Error(`Инициализация E2E отменена закрытием runtime (${phase}).`);
    }
    if (String(this.getUser?.()?.id || '') !== userId) {
      throw new Error(`Аккаунт изменился во время инициализации E2E (${phase}). Инициализация остановлена.`);
    }
  }

  async #initialize(userId, generation) {
    if (!userId) throw new Error('Для E2E требуется авторизация в РИМ.');
    if (!this.environment.isSecureContext || !this.environment.indexedDB || !this.environment.crypto?.subtle) {
      throw new Error('Для E2E нужны HTTPS, IndexedDB и Web Crypto в браузере.');
    }

    const [sdk, webSqlite] = await Promise.all([this.importSdk(), this.importWebSqliteStore()]);
    this.#assertActiveAccount(userId, 'загрузка SDK', generation);
    if (typeof sdk.createSignalProtocolClient !== 'function' || typeof webSqlite.webSqliteStore !== 'function') {
      throw new Error('Установленная версия Signal Protocol SDK не содержит ожидаемого browser API.');
    }
    const accountDigest = await this.environment.crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
    const accountSuffix = Array.from(new Uint8Array(accountDigest).slice(0, 12), byte => byte.toString(16).padStart(2, '0')).join('');
    const storageName = `rim-signal-${accountSuffix}.db`;

    // Prefer the encrypted SQLite database in OPFS. Fall back only when OPFS
    // itself is unavailable; do not hide Wasm/CSP or transient lock failures.
    // Both backends are namespaced by a hash of the account ID so signing into
    // a second account cannot reuse the first account's local identity/session DB.
    let storage;
    let storageBackend = 'web-sqlite-opfs';
    try {
      storage = await webSqlite.webSqliteStore({
        name: storageName,
        encryptionAtRest: true,
        // These same-origin assets are emitted by scripts/build-cloudflare.mjs.
        // The SDK's worker and Wasm are not discovered automatically by the main app bundle.
        workerUrl: new URL('./e2e/sqlite-worker.js', import.meta.url),
        wasmUrl: new URL('./e2e/sqlite3.wasm', import.meta.url)
      });
      this.#assertActiveAccount(userId, 'открытие OPFS-хранилища', generation);
    } catch (error) {
      const code = error?.code || error?.cause?.code || '';
      if (code !== 'OPFS_UNAVAILABLE') {
        try { await storage?.close?.(); } catch { /* preserve the initialization error */ }
        throw error;
      }
      try {
        const webStore = await this.importWebStore();
        this.#assertActiveAccount(userId, 'загрузка IndexedDB-хранилища', generation);
        if (typeof webStore.IndexedDbSignalProtocolStore !== 'function') {
          throw new Error('IndexedDB fallback is unavailable in the installed Signal Protocol SDK.');
        }
        storage = new webStore.IndexedDbSignalProtocolStore();
        storage.dbName = storageName;
        storage.storeIdentity = storageName;
        await storage.initialize();
        this.#assertActiveAccount(userId, 'открытие IndexedDB-хранилища', generation);
        storageBackend = 'indexeddb-record-cipher-fallback';
      } catch (fallbackError) {
        try { await storage?.close?.(); } catch { /* preserve the initialization error */ }
        throw fallbackError;
      }
    }
    let relay = null;
    let client = null;
    try {
      let deviceId = 1;
      if (this.relayFactory) {
        relay = await this.relayFactory({ userId, storage, sdk });
        const contract = inspectSignalRelayContract(relay);
        if (!contract.valid) throw new Error(`E2E relay не реализует обязательный контракт SDK: ${contract.missing.join(', ')}.`);
        const devices = await relay.getDevices(userId);
        this.#assertActiveAccount(userId, 'проверка зарегистрированных устройств', generation);
        const registeredDevices = Array.isArray(devices) ? devices : [];
        const primary = registeredDevices.find(device => Number(device.deviceId) === 1);
        const hasLocalIdentity = typeof storage.hasIdentityKey === 'function' ? await storage.hasIdentityKey('aci') : false;
        this.#assertActiveAccount(userId, 'проверка локальной идентичности', generation);
        if (primary && !hasLocalIdentity) {
          throw new Error('У аккаунта уже есть основное E2E-устройство. Для нового браузера сначала нужна защищённая процедура привязки или переноса ключей; перезаписывать устройство нельзя.');
        }
        if (!primary && registeredDevices.length > 0 && !hasLocalIdentity) {
          throw new Error('У аккаунта уже есть привязанные E2E-устройства. Создание нового основного устройства без переноса идентичности запрещено.');
        }
        if (!primary) {
          const allocated = await relay.registerDevice(userId, { deviceId: 1, deviceType: 'web' });
          this.#assertActiveAccount(userId, 'регистрация устройства', generation);
          if (Number(allocated) !== 1) throw new Error('Relay не подтвердил регистрацию основного устройства RIM.');
        }
        deviceId = 1;
        relay.setCurrentDevice(userId, deviceId);
        this.#assertActiveAccount(userId, 'выбор активного E2E-устройства', generation);
      }

      const adapters = { storage };
      if (relay) adapters.relay = relay;
      this.#assertActiveAccount(userId, 'создание криптографического клиента', generation);
      client = await sdk.createSignalProtocolClient({
        identity: { userId },
        deviceId,
        adapters,
        protocol: { postQuantum: 'required', braid: 'required' },
        hooks: {
          onMessageDecrypted: async message => {
            // Control frames are processed only after Signal SDK decryption and
            // never enter the visible chat timeline or local message history.
            if (await this.#handlePeerVerificationFrame(message, userId)) return;
            void this.diagnostics?.record?.('message_received', { status: 'success', deviceId: this.deviceId, metadata: { transport: 'signal_sdk' } });
            // Persist in the app before acknowledging/finishing the SDK receive.
            await this.onDecryptedMessage?.(message, { userId });
          }
        }
      });
      this.#assertActiveAccount(userId, 'завершение создания криптографического клиента', generation);
    } catch (error) {
      try { await client?.stop?.(); } catch { /* preserve the initialization error */ }
      try { await client?.close?.(); } catch { /* preserve the initialization error */ }
      try { await relay?.stop?.(); } catch { /* preserve the initialization error */ }
      try { await storage?.close?.(); } catch { /* preserve the initialization error */ }
      throw error;
    }

    this.client = client;
    this.storage = storage;
    this.relay = relay;
    this.userId = userId;
    this.deviceId = 1;
    this.protocolReady = false;
    this.state = relay ? 'client-ready-relay-unverified' : 'local-client-ready';
    this.logger?.info?.('e2e.signal_sdk.initialized', {
      sdk: '14.7.0', relayConfigured: Boolean(relay), storageBackend, userId
    });
    return client;
  }

  startIncoming() {
    // A call made during teardown must join the teardown boundary and then
    // retry against the new runtime generation, never join a stale start.
    if (this.disposing) return this.disposing.then(() => this.startIncoming());
    // initialize() itself is concurrency-safe, but the subsequent server sync
    // and SDK subscription are not guaranteed to be idempotent. Publish the
    // in-flight promise synchronously so parallel auth/startup events join it.
    if (this.incomingStarting) return this.incomingStarting;
    const task = this.#startIncoming().catch(error => {
      void this.diagnostics?.record?.('runtime_error', { status: 'error', code: 'incoming_start_failed', deviceId: this.deviceId, metadata: { phase: 'incoming_start' } });
      throw error;
    });
    this.incomingStarting = task;
    task.finally(() => {
      if (this.incomingStarting === task) this.incomingStarting = null;
    }).catch(() => {});
    return task;
  }

  async #startIncoming() {
    const client = await this.initialize();
    const userId = String(this.getUser?.()?.id || '');
    const generation = this.lifecycleGeneration;
    this.#assertActiveAccount(userId, 'запуск входящего relay', generation);
    if (this.incomingClient === client) {
      return { state: this.state, protocolReady: this.protocolReady };
    }
    if (!this.relay) throw new Error('E2E-клиент создан, но защищённый relay ещё не подключён. Доставка сообщений недоступна.');
    if (typeof client.startRelaySubscription !== 'function') throw new Error('SDK не предоставляет relay subscription API.');
    if (typeof client.syncToServer === 'function') await client.syncToServer();
    this.#assertActiveAccount(userId, 'синхронизация входящих сообщений', generation);
    if (this.client !== client) throw new Error('E2E-клиент был закрыт во время запуска входящей доставки.');
    await client.startRelaySubscription();
    try {
      this.#assertActiveAccount(userId, 'подключение входящей подписки', generation);
      if (this.client !== client) throw new Error('E2E-клиент был закрыт во время подключения входящей доставки.');
    } catch (error) {
      // Some SDK subscription implementations may finish attaching after a
      // concurrent stop/close began. Detach once more after the async start
      // settles so a late subscription cannot outlive this runtime generation.
      try { await client.stopRelaySubscription?.(); } catch { /* preserve stale-start error */ }
      throw error;
    }
    this.incomingClient = client;
    try { this.relayStateUnsubscribe?.(); } catch { /* best effort */ }
    this.relayStateUnsubscribe = this.relay?.subscribeRelayConnectionState?.(state => {
      if (this.incomingClient !== client) return;
      if (state?.state !== 'connected') {
        this.protocolReady = false;
        this.verifiedScopes.clear();
        this.state = 'relay-reconnecting';
      } else if (this.state !== 'relay-verified') {
        this.protocolReady = false;
        this.state = 'relay-connected-unverified';
      }
    }) || null;
    this.state = 'relay-connected-unverified';
    // Deliberately stays false until the RIM transport adapter and real
    // two-account round-trip have passed. Never infer readiness from startup.
    this.protocolReady = false;
    void this.diagnostics?.record?.('relay_state', { status: 'connected', deviceId: this.deviceId, metadata: { state: this.state } });
    return { state: this.state, protocolReady: this.protocolReady };
  }

  async #handlePeerVerificationFrame(message, localUserId) {
    const raw = message?.content ?? message?.body ?? null;
    if (typeof raw !== 'string' || raw.length > 4096) return false;
    let frame;
    try { frame = JSON.parse(raw); } catch { return false; }
    if (frame?.type !== 'rim.e2e.peer-verification.v1' || frame.version !== 1 || typeof frame.nonce !== 'string' || !/^[a-f0-9]{32,128}$/i.test(frame.nonce)) return false;
    const sender = String(message?.senderId || message?.senderUserId || '');
    const conversationId = String(frame.conversationId || '');
    const scopeType = ['direct', 'group', 'private_channel'].includes(String(frame.scopeType || 'direct')) ? String(frame.scopeType || 'direct') : '';
    if (!sender || sender === localUserId || !conversationId || conversationId.length > 128 || !scopeType || this.relay?.isProductionRelay !== true) return true;
    if (frame.phase === 'challenge') {
      if (!this.client || this.userId !== localUserId || typeof this.client.send !== 'function') return true;
      // The relay proves that the two users share some protected scope, but
      // the encrypted frame names one exact scope. Confirm sender membership
      // against that exact scope before acknowledging or marking it verified.
      let authorized = false;
      try {
        authorized = typeof this.authorizePeerVerification === 'function'
          && await this.authorizePeerVerification({ scopeType, conversationId, senderUserId: sender, localUserId });
      } catch (error) {
        this.logger?.warn?.('e2e.peer_verification.scope_check_failed', { conversationId, scopeType, message: error?.message || String(error) });
      }
      if (authorized !== true) {
        void this.diagnostics?.record?.('peer_exchange_failed', { status: 'error', code: 'peer_scope_membership_rejected', conversationId, deviceId: this.deviceId, metadata: { scopeType } });
        return true;
      }
      const ack = JSON.stringify({ type: 'rim.e2e.peer-verification.v1', version: 1, phase: 'ack', nonce: frame.nonce, conversationId, scopeType });
      // A decrypted challenge proves this peer can receive; the accepted
      // encrypted ACK proves it can respond. Only direct scopes can be marked
      // here because groups/channels require every member to be checked.
      this.protocolReady = true;
      this.state = 'relay-verified';
      try { await this.client.send(sender, ack, { clientMessageId: `rim-e2e-ack-${frame.nonce}`, timestamp: Date.now() }); }
      catch (error) { this.protocolReady = false; this.verifiedScopes.delete(`${scopeType}:${conversationId}`); this.state = 'relay-connected-unverified'; throw error; }
      // In a direct chat, the decrypted challenge plus accepted encrypted ACK
      // proves the bidirectional pairwise path for this exact scope. A group
      // or channel challenge proves only one peer, so those scopes still need
      // the full all-members exchange initiated by verifyScopeExchange().
      if (scopeType === 'direct') this.verifiedScopes.add(`${scopeType}:${conversationId}`);
      void this.diagnostics?.record?.('runtime_ready', { status: 'success', conversationId, deviceId: this.deviceId, metadata: { verification: 'peer_challenge_ack', scopeType, responder: true } });
      return true;
    }
    if (frame.phase === 'ack') {
      const pending = this.pendingPeerVerifications.get(frame.nonce);
      if (!pending || pending.peerUserId !== sender || pending.conversationId !== conversationId || pending.scopeType !== scopeType) return true;
      this.pendingPeerVerifications.delete(frame.nonce);
      this.protocolReady = true;
      this.state = 'relay-verified';
      pending.resolve({ verified: true, peerUserId: sender, conversationId });
      void this.diagnostics?.record?.('runtime_ready', { status: 'success', conversationId, deviceId: this.deviceId, metadata: { verification: 'peer_challenge_ack' } });
      return true;
    }
    return true;
  }

  async verifyPeerExchange(peerUserId, conversationId, { timeoutMs = 10000, scopeType = 'direct', deferScopeMark = false } = {}) {
    const client = await this.initialize();
    const userId = String(this.getUser?.()?.id || '');
    const peer = String(peerUserId || '');
    const scope = String(conversationId || '');
    const normalizedScopeType = String(scopeType || 'direct');
    if (!['direct', 'group', 'private_channel'].includes(normalizedScopeType)) throw new Error('Неподдерживаемый тип E2E-переписки.');
    if (!userId || this.userId !== userId || !peer || peer === userId || !scope || scope.length > 128 || !['direct', 'group', 'private_channel'].includes(scopeType)) throw new Error('Для проверки E2E нужны действующие аккаунт, собеседник и ID защищённой переписки.');
    if (!this.relay || this.relay.isProductionRelay !== true || this.state !== 'relay-connected-unverified' && this.state !== 'relay-verified') throw new Error('Сначала подключи production Signal Relay на устройстве.');
    if (typeof client.send !== 'function') throw new Error('Signal SDK не предоставляет защищённую отправку для проверки.');
    const nonceBytes = this.environment.crypto.getRandomValues?.(new Uint8Array(24));
    const nonce = nonceBytes ? Array.from(nonceBytes, b => b.toString(16).padStart(2, '0')).join('') : String(this.environment.crypto.randomUUID()).replace(/[^a-f0-9]/gi, '').padEnd(32, '0').slice(0, 48);
    const timeout = Math.max(1000, Math.min(30000, Number(timeoutMs) || 10000));
    const startedAt = Date.now();
    let result;
    try { result = await new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => { this.pendingPeerVerifications.delete(nonce); reject(new Error('Истекло время ожидания зашифрованного подтверждения собеседника.')); }, timeout);
      this.pendingPeerVerifications.set(nonce, { peerUserId: peer, conversationId: scope, scopeType: normalizedScopeType, deferScopeMark: deferScopeMark === true, timer, resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      try {
        const challenge = JSON.stringify({ type: 'rim.e2e.peer-verification.v1', version: 1, phase: 'challenge', nonce, conversationId: scope, scopeType: normalizedScopeType });
        await client.send(peer, challenge, { clientMessageId: `rim-e2e-challenge-${nonce}`, timestamp: Date.now() });
      } catch (error) { clearTimeout(timer); this.pendingPeerVerifications.delete(nonce); reject(error); }
    }); } catch (error) {
      void this.diagnostics?.record?.('runtime_error', { status: 'error', code: 'peer_verification_failed', conversationId: scope, deviceId: this.deviceId, latencyMs: Date.now() - startedAt, metadata: { scopeType: normalizedScopeType } });
      throw error;
    }
    return result;
  }

  async verifyScopeExchange(scope, memberUserIds, { timeoutMs = 10000 } = {}) {
    const type = String(scope?.type || scope?.scopeType || '');
    const id = String(scope?.id || scope?.scopeId || '');
    const self = String(this.getUser?.()?.id || '');
    if (!['direct', 'group', 'private_channel'].includes(type) || !id || !self) throw new Error('Некорректная E2E-область или аккаунт.');
    const peers = [...new Set((Array.isArray(memberUserIds) ? memberUserIds : []).map(value => String(value || '')).filter(value => value && value !== self))];
    if (!peers.length || peers.length > 200) throw new Error('Для проверки E2E требуется список участников защищённой переписки.');
    const verified = [];
    for (let offset = 0; offset < peers.length; offset += 10) {
      const batch = peers.slice(offset, offset + 10);
      const results = await Promise.all(batch.map(peer => this.verifyPeerExchange(peer, id, { timeoutMs, scopeType: type })));
      verified.push(...results.map(result => result.peerUserId));
    }
    this.verifiedScopes.add(`${type}:${id}`);
    return { verified: true, scopeType: type, conversationId: id, verifiedPeerCount: verified.length };
  }

  isScopeVerified(scope) {
    const type = String(scope?.type || scope?.scopeType || '');
    const id = String(scope?.id || scope?.scopeId || '');
    return ['direct', 'group', 'private_channel'].includes(type) && Boolean(id) && this.verifiedScopes.has(`${type}:${id}`);
  }

  async sendDirect(recipientUserId, plaintext, { conversationId, replyTo = null, clientMessageId = null, timestamp = null } = {}) {
    const client = await this.initialize();
    const senderUserId = String(this.getUser?.()?.id || '');
    if (!senderUserId || senderUserId !== this.userId) throw new Error('Аккаунт изменился перед E2E-отправкой. Отправка остановлена.');
    if (!this.relay) throw new Error('Отправка E2E пока заблокирована: relay доставки не подключён.');
    const recipient = String(recipientUserId || '');
    const conversation = String(conversationId || '');
    const content = String(plaintext ?? '');
    if (!recipient || recipient === this.userId) throw new Error('Укажи корректного собеседника.');
    if (!conversation || conversation.length > 128) throw new Error('Для E2E требуется корректный ID диалога РИМа.');
    if (!content || content.length > 10000) throw new Error('Сообщение должно содержать от 1 до 10000 символов.');
    timestamp = timestamp == null ? Math.max(Date.now(), this.lastSentTimestamp + 1) : Number(timestamp);
    if (!Number.isSafeInteger(timestamp) || timestamp < Date.now() - 86400000 || timestamp > Date.now() + 300000) throw new Error('Некорректная временная метка E2E-сообщения.');
    this.lastSentTimestamp = Math.max(this.lastSentTimestamp, timestamp);
    if (typeof client.send !== 'function') throw new Error('SDK не предоставляет метод защищённой отправки.');
    if (typeof this.messageStore?.put !== 'function' || typeof this.messageStore?.getConversation !== 'function') throw new Error('Для E2E-отправки обязательно локальное зашифрованное хранилище истории.');
    const operationId = String(clientMessageId || this.environment.crypto.randomUUID());
    const payload = JSON.stringify({
      type: 'rim.chat.text.v1', version: 1, conversationId: conversation,
      recipientId: recipient, body: content, replyTo: replyTo ? String(replyTo) : null, timestamp,
    });
    const result = await client.send(recipient, payload, { clientMessageId: operationId, timestamp });
    try { await this.relay.touchScope?.('direct', conversation); } catch (error) { this.logger?.warn?.('e2e.scope.touch_failed', { message: error?.message || String(error) }); }
    void this.diagnostics?.record?.('message_send', { status: 'success', conversationId: conversation, deviceId: this.deviceId, metadata: { transport: 'signal_sdk' } });
    const localMessage = {
      messageId: String(result.messageId || operationId), conversationId: conversation,
      body: content, senderId: this.userId, recipientId: recipient,
      replyTo: replyTo ? String(replyTo) : null, direction: 'outgoing',
      timestamp: Number(result.clientTimestamp || timestamp),
    };
    if (String(this.getUser?.()?.id || '') !== senderUserId || this.userId !== senderUserId) {
      // The relay accepted the message, but a different account is now active.
      // Never write the old account's plaintext into the newly active local DB.
      return { ...result, localMessage, localPersisted: false, accountChanged: true };
    }
    let localPersisted = false;
    try {
      await this.messageStore?.put?.(localMessage, { expectedUserId: senderUserId });
      if (String(this.getUser?.()?.id || '') !== senderUserId || this.userId !== senderUserId) {
        return { ...result, localMessage, localPersisted: true, accountChanged: true };
      }
      localPersisted = true;
    } catch (error) {
      // Relay acceptance has already happened. Do not report a generic send
      // failure that encourages a duplicate retry; return the accepted local
      // representation and explicitly mark that durable local history failed.
      this.logger?.error?.('e2e.local_outgoing_store_failed', { message: error?.message || String(error), messageId: localMessage.messageId });
    }
    try { await this.onOutgoingMessage?.(localMessage); } catch (error) {
      this.logger?.warn?.('e2e.local_outgoing_event_failed', { message: error?.message || String(error), messageId: localMessage.messageId });
    }
    return { ...result, localMessage, localPersisted };
  }

  async sendGroup(memberUserIds, plaintext, { conversationId, scopeType = 'group', replyTo = null, clientMessageId = null, timestamp = null } = {}) {
    const client = await this.initialize();
    const senderUserId = String(this.getUser?.()?.id || '');
    if (!senderUserId || senderUserId !== this.userId) throw new Error('Аккаунт изменился перед E2E-отправкой группы.');
    if (!this.relay || typeof client.send !== 'function') throw new Error('Отправка E2E пока заблокирована: relay доставки не подключён.');
    if (!['group', 'private_channel'].includes(String(scopeType))) throw new Error('Неверный тип защищённой групповой переписки.');
    const conversation = String(conversationId || '');
    const content = String(plaintext ?? '');
    if (!conversation || conversation.length > 128) throw new Error('Для E2E требуется корректный ID группы.');
    if (!content || content.length > 10000) throw new Error('Сообщение должно содержать от 1 до 10000 символов.');
    const recipients = [...new Set((Array.isArray(memberUserIds) ? memberUserIds : []).map(value => String(value || '').trim()).filter(value => value && value !== senderUserId))];
    if (!recipients.length || recipients.length > 200) throw new Error('Для E2E-группы нужны от 1 до 200 других участников.');
    timestamp = timestamp == null ? Math.max(Date.now(), this.lastSentTimestamp + 1) : Number(timestamp);
    const finalSendTimestamp = timestamp + recipients.length - 1;
    if (!Number.isSafeInteger(timestamp) || !Number.isSafeInteger(finalSendTimestamp)
      || timestamp < Date.now() - 86400000 || finalSendTimestamp > Date.now() + 300000) {
      throw new Error('Некорректная временная метка E2E-сообщения.');
    }
    // Signal SDK requires a distinct send timestamp for each message emitted
    // by this device. A group/channel fan-out is N pairwise messages, not one
    // multicast packet; reusing the same timestamp makes later recipients fail.
    this.lastSentTimestamp = Math.max(this.lastSentTimestamp, finalSendTimestamp);
    if (typeof client.send !== 'function') throw new Error('SDK не предоставляет защищённую отправку.');
    if (typeof this.messageStore?.put !== 'function' || typeof this.messageStore?.getConversation !== 'function') throw new Error('Для E2E требуется локальное зашифрованное хранилище истории.');
    const operationId = String(clientMessageId || this.environment.crypto.randomUUID());
    const deliveries = [];
    for (let offset = 0; offset < recipients.length; offset += 10) {
      const batch = recipients.slice(offset, offset + 10);
      deliveries.push(...await Promise.allSettled(batch.map(async (recipient, batchIndex) => {
        const recipientIndex = offset + batchIndex;
        const sendTimestamp = timestamp + recipientIndex;
        const payload = JSON.stringify({ type: 'rim.chat.text.v1', version: 1, conversationId: conversation, recipientId: recipient, body: content, replyTo: replyTo ? String(replyTo) : null, timestamp });
        const result = await client.send(recipient, payload, { clientMessageId: `${operationId}:${recipient}`, timestamp: sendTimestamp });
        return { recipient, messageId: String(result.messageId || ''), result };
      })));
    }
    const accepted = deliveries.filter(item => item.status === 'fulfilled').map(item => item.value);
    const failed = deliveries.filter(item => item.status === 'rejected').map((item, index) => ({ recipient: recipients[deliveries.findIndex(entry => entry === item)] || recipients[index], error: String(item.reason?.message || item.reason || 'delivery_failed').slice(0, 180) }));
    if (!accepted.length) throw new Error(`Не удалось доставить E2E-сообщение ни одному участнику: ${failed[0]?.error || 'relay_error'}`);
    try { await this.relay.touchScope?.(scopeType, conversation); } catch (error) { this.logger?.warn?.('e2e.scope.touch_failed', { message: error?.message || String(error) }); }
    const localMessage = {
      messageId: operationId, conversationId: conversation, body: content,
      senderId: senderUserId, recipientId: recipients.join(','), replyTo: replyTo ? String(replyTo) : null,
      direction: 'outgoing', timestamp
    };
    if (String(this.getUser?.()?.id || '') !== senderUserId || this.userId !== senderUserId) return { messageId: operationId, acceptedRecipientCount: accepted.length, failedRecipientCount: failed.length, failedRecipients: failed, localMessage, localPersisted: false, accountChanged: true };
    let localPersisted = false;
    try {
      await this.messageStore.put(localMessage, { expectedUserId: senderUserId });
      localPersisted = true;
    } catch (error) { this.logger?.error?.('e2e.local_group_outgoing_store_failed', { message: error?.message || String(error), messageId: operationId }); }
    try { await this.onOutgoingMessage?.(localMessage); } catch (error) { this.logger?.warn?.('e2e.local_outgoing_event_failed', { message: error?.message || String(error) }); }
    void this.diagnostics?.record?.('message_send', { status: failed.length ? 'warning' : 'success', conversationId: conversation, deviceId: this.deviceId, metadata: { transport: 'signal_sdk', scope: scopeType, acceptedRecipients: accepted.length, failedRecipients: failed.length } });
    return { messageId: localMessage.messageId, acceptedRecipientCount: accepted.length, failedRecipientCount: failed.length, failedRecipients: failed, localMessage, localPersisted };
  }

  async getLocalConversation(conversationId, options = {}) {
    if (!this.messageStore?.getConversation) throw new Error('Локальное хранилище E2E-сообщений не подключено.');
    const userId = String(this.getUser?.()?.id || '');
    if (!userId || userId !== this.userId) throw new Error('Аккаунт изменился; локальная E2E-история не будет прочитана.');
    const rows = await this.messageStore.getConversation(conversationId, { ...options, expectedUserId: userId });
    if (String(this.getUser?.()?.id || '') !== userId || this.userId !== userId) throw new Error('Аккаунт изменился во время чтения E2E-истории.');
    return rows;
  }

  async stop() {
    this.protocolReady = false;
    this.verifiedScopes.clear();
    this.state = 'stopping';
    try {
      if (typeof this.client?.stop === 'function') await this.client.stop();
      else this.client?.stopRelaySubscription?.();
    } catch (error) {
      this.logger?.warn?.('e2e.signal_sdk.stop.failed', { message: error?.message || String(error) });
    }
    this.state = 'stopped';
  }

  async dispose() {
    if (this.disposing) return this.disposing;
    // Invalidate in-flight initialize/startIncoming work before awaiting any
    // SDK operation. This also covers disposal without an account switch.
    this.lifecycleGeneration += 1;
    // A pending initial sync may not be cancellable by the SDK. Detach its
    // promise so a fresh caller can queue behind disposal; generation checks
    // prevent the stale operation from subscribing if it eventually resumes.
    this.incomingStarting = null;
    const task = (async () => {
      await this.stop();
      try { await this.client?.close?.(); } catch { /* SDK versions may not expose close */ }
      try { await this.storage?.close?.(); } catch { /* best effort */ }
      try { this.relayStateUnsubscribe?.(); } catch { /* best effort */ }
      this.relayStateUnsubscribe = null;
      for (const pending of this.pendingPeerVerifications.values()) { clearTimeout(pending.timer); pending.reject?.(new Error('E2E runtime закрыт до завершения проверки устройства.')); }
      this.pendingPeerVerifications.clear();
      this.client = null;
      this.storage = null;
      this.relay = null;
      this.incomingClient = null;
      this.userId = null;
      this.deviceId = 1;
      this.lastSentTimestamp = 0;
      this.protocolReady = false;
      this.verifiedScopes.clear();
    })();
    this.disposing = task;
    try { await task; }
    finally { if (this.disposing === task) this.disposing = null; }
  }
}
