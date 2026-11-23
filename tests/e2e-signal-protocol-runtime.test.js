import test from 'node:test';
import assert from 'node:assert/strict';
import { RimSignalProtocolRuntime } from '../src/security/e2e/signal-protocol-runtime.js';

function browserEnv() { return { isSecureContext: true, indexedDB: { open() {} }, crypto: { subtle: { digest: async () => new Uint8Array(32).buffer } } }; }

test('Signal Protocol runtime creates a strict-PQ local client but never claims E2E readiness', async () => {
  let config;
  const runtime = new RimSignalProtocolRuntime({
    getUser: () => ({ id: 'user-a' }), environment: browserEnv(),
    importSdk: async () => ({ createSignalProtocolClient: async value => { config = value; return {}; } }),
    importWebSqliteStore: async () => ({ webSqliteStore: async () => ({ close() {} }) }),
    importWebStore: async () => ({ indexedDbStore: async () => ({ close() {} }) })
  });
  try {
    await runtime.initialize();
    assert.equal(config.identity.userId, 'user-a');
    assert.equal(config.protocol.postQuantum, 'required');
    assert.equal(config.protocol.braid, 'required');
    assert.equal(runtime.protocolReady, false);
    assert.equal(runtime.state, 'local-client-ready');
  } finally { await runtime.dispose(); }
});

test('Signal Protocol runtime fails closed when no relay is configured', async () => {
  const runtime = new RimSignalProtocolRuntime({
    getUser: () => ({ id: 'user-a' }), environment: browserEnv(),
    importSdk: async () => ({ createSignalProtocolClient: async () => ({ send: async () => 'should-not-send' }) }),
    importWebSqliteStore: async () => ({ webSqliteStore: async () => ({}) }),
    importWebStore: async () => ({ indexedDbStore: async () => ({}) })
  });
  try {
    await assert.rejects(() => runtime.startIncoming(), /relay ещё не подключён/);
    await assert.rejects(() => runtime.sendDirect('user-b', 'hello'), /relay доставки не подключён/);
    assert.equal(runtime.protocolReady, false);
  } finally { await runtime.dispose(); }
});

test('Signal Protocol runtime refuses missing authentication and insecure browser contexts', async () => {
  const noUser = new RimSignalProtocolRuntime({ getUser: () => null, environment: browserEnv() });
  await assert.rejects(() => noUser.initialize(), /требуется авторизация/);
  const insecure = new RimSignalProtocolRuntime({ getUser: () => ({ id: 'user-a' }), environment: { isSecureContext: false, indexedDB: {}, crypto: { subtle: {} } } });
  await assert.rejects(() => insecure.initialize(), /HTTPS/);
});


test('Signal Protocol runtime can use an injected relay but still waits for RIM transport verification', async () => {
  const calls = [];
  const client = {
    syncToServer: async () => calls.push('sync'),
    startRelaySubscription: () => calls.push('subscribe'),
    stopRelaySubscription: () => calls.push('stop'),
    send: async (recipient, content, options) => ({ recipient, content, options, messageId: 'relay-message-1', clientTimestamp: options.timestamp })
  };
  const runtime = new RimSignalProtocolRuntime({
    getUser: () => ({ id: 'user-a' }), environment: browserEnv(),
    relayFactory: async () => Object.assign(Object.fromEntries([
      'send','subscribe','subscribeRelayConnectionState','markDelivered','removeDevice','setCurrentDevice',
      'provisionIdentityKey','rotateIdentityKey','getIdentityKey','uploadPreKeys','fetchPreKeyBundle','getPreKeyCount',
      'getPreKeyInventory','clearStaleKemPreKeys','publishPlannedPreKeys','getActiveDevices',
      'getEcSignedPreKeyMetadata','getKemLastResortPreKeyMetadata'
    ].map(name => [name, async () => ({ messageId: 'relay-id' })])), {
      getDevices: async () => [], registerDevice: async () => 1, setCurrentDevice: () => 1,
      relayConnectionState: { state: 'stopped', since: Date.now() }
    }),
    importSdk: async () => ({ createSignalProtocolClient: async () => client }),
    importWebSqliteStore: async () => ({ webSqliteStore: async () => ({ close() {} }) }),
    importWebStore: async () => ({ indexedDbStore: async () => ({ close() {} }) }),
    messageStore: { put: async message => message, getConversation: async () => [] }
  });
  try {
    const state = await runtime.startIncoming();
    assert.deepEqual(calls, ['sync', 'subscribe']);
    assert.equal(state.protocolReady, false);
    const sent = await runtime.sendDirect('user-b', 'ciphertext test', { conversationId: 'conversation-1', clientMessageId: 'send-1' });
    assert.equal(sent.recipient, 'user-b');
    assert.equal(JSON.parse(sent.content).body, 'ciphertext test');
    assert.equal(JSON.parse(sent.content).conversationId, 'conversation-1');
    assert.equal(sent.options.clientMessageId, 'send-1');
    assert.equal(runtime.protocolReady, false);
  } finally { await runtime.dispose(); }
});


test('Signal Protocol runtime prefers encrypted OPFS SQLite and falls back only when OPFS is unavailable', async () => {
  const used = [];
  const makeRuntime = (failure) => new RimSignalProtocolRuntime({
    getUser: () => ({ id: 'user-a' }), environment: browserEnv(),
    importSdk: async () => ({ createSignalProtocolClient: async () => ({}) }),
    importWebSqliteStore: async () => ({ webSqliteStore: async options => { used.push(['opfs', options]); if (failure) throw failure; return { close() {} }; } }),
    importWebStore: async () => ({ IndexedDbSignalProtocolStore: class { constructor() { this.dbName = 'signal-protocol-storage'; this.storeIdentity = this.dbName; } async initialize() { used.push(['indexeddb', this.dbName, this.storeIdentity]); } close() {} } })
  });
  const primary = makeRuntime(null);
  try { await primary.initialize(); assert.equal(used[0][0], 'opfs');
    assert.match(used[0][1].name, /^rim-signal-[0-9a-f]{24}\.db$/);
    assert.equal(used[0][1].encryptionAtRest, true);
    assert.match(used[0][1].workerUrl.pathname, /e2e\/sqlite-worker\.js$/);
    assert.match(used[0][1].wasmUrl.pathname, /e2e\/sqlite3\.wasm$/); }
  finally { await primary.dispose(); }
  used.length = 0;
  const fallback = makeRuntime(Object.assign(new Error('OPFS unavailable'), { code: 'OPFS_UNAVAILABLE' }));
  try { await fallback.initialize(); assert.equal(used[0][0], 'opfs'); assert.equal(used[1][0], 'indexeddb'); assert.match(used[1][1], /^rim-signal-[0-9a-f]{24}\.db$/); assert.equal(used[1][1], used[1][2]); }
  finally { await fallback.dispose(); }
});

test('Signal Protocol runtime does not hide OPFS Wasm/CSP or file-lock failures behind IndexedDB fallback', async () => {
  let fallbackCalls = 0;
  const runtime = new RimSignalProtocolRuntime({
    getUser: () => ({ id: 'user-a' }), environment: browserEnv(),
    importSdk: async () => ({ createSignalProtocolClient: async () => ({}) }),
    importWebSqliteStore: async () => ({ webSqliteStore: async () => { throw Object.assign(new Error('Wasm engine unavailable'), { code: 'SQLITE_ENGINE_UNAVAILABLE' }); } }),
    importWebStore: async () => { fallbackCalls++; return { indexedDbStore: async () => ({}) }; }
  });
  await assert.rejects(() => runtime.initialize(), /Wasm engine unavailable/);
  assert.equal(fallbackCalls, 0);
});

test('Signal Protocol runtime awaits SDK stop before closing local storage', async () => {
  const order = [];
  const runtime = new RimSignalProtocolRuntime({
    getUser: () => ({ id: 'user-a' }), environment: browserEnv(),
    importSdk: async () => ({ createSignalProtocolClient: async () => ({
      stop: async () => { order.push('stop-start'); await Promise.resolve(); order.push('stop-end'); }
    }) }),
    importWebSqliteStore: async () => ({ webSqliteStore: async () => ({ close: async () => order.push('store-close') }) })
  });
  await runtime.initialize();
  await runtime.dispose();
  assert.deepEqual(order, ['stop-start', 'stop-end', 'store-close']);
  assert.equal(runtime.state, 'stopped');
});

test('Signal Protocol runtime closes the selected store if client construction fails', async () => {
  let closed = false;
  const runtime = new RimSignalProtocolRuntime({
    getUser: () => ({ id: 'user-a' }), environment: browserEnv(),
    importSdk: async () => ({ createSignalProtocolClient: async () => { throw new Error('client init failed'); } }),
    importWebSqliteStore: async () => ({ webSqliteStore: async () => ({ close: async () => { closed = true; } }) })
  });
  await assert.rejects(() => runtime.initialize(), /client init failed/);
  assert.equal(closed, true);
});

test('Signal Protocol runtime registers the primary device only when the account has no registered device', async () => {
  const calls = [];
  const relay = Object.assign(Object.fromEntries([
    'send','subscribe','subscribeRelayConnectionState','markDelivered','removeDevice','setCurrentDevice',
    'provisionIdentityKey','rotateIdentityKey','getIdentityKey','uploadPreKeys','fetchPreKeyBundle','getPreKeyCount',
    'getPreKeyInventory','clearStaleKemPreKeys','publishPlannedPreKeys','getActiveDevices',
    'getEcSignedPreKeyMetadata','getKemLastResortPreKeyMetadata'
  ].map(name => [name, async () => true])), {
    getDevices: async () => [],
    registerDevice: async (_userId, device) => { calls.push(device); return 1; },
    setCurrentDevice: (_userId, deviceId) => { calls.push({ currentDeviceId: deviceId }); return deviceId; },
    relayConnectionState: { state: 'stopped', since: Date.now() }
  });
  const runtime = new RimSignalProtocolRuntime({
    getUser: () => ({ id: 'fresh-user' }), environment: browserEnv(),
    relayFactory: async () => relay,
    importSdk: async () => ({ createSignalProtocolClient: async () => ({}) }),
    importWebSqliteStore: async () => ({ webSqliteStore: async () => ({ hasIdentityKey: async () => false, close() {} }) }),
  });
  try {
    await runtime.initialize();
    assert.deepEqual(calls, [{ deviceId: 1, deviceType: 'web' }, { currentDeviceId: 1 }]);
  } finally { await runtime.dispose(); }
});

test('Signal Protocol runtime refuses to overwrite an existing primary device when local identity is absent', async () => {
  let registrationCalls = 0;
  const relay = Object.assign(Object.fromEntries([
    'send','subscribe','subscribeRelayConnectionState','markDelivered','removeDevice','setCurrentDevice',
    'provisionIdentityKey','rotateIdentityKey','getIdentityKey','uploadPreKeys','fetchPreKeyBundle','getPreKeyCount',
    'getPreKeyInventory','clearStaleKemPreKeys','publishPlannedPreKeys','getActiveDevices',
    'getEcSignedPreKeyMetadata','getKemLastResortPreKeyMetadata'
  ].map(name => [name, async () => true])), {
    getDevices: async () => [{ deviceId: 1, registered: true }],
    registerDevice: async () => { registrationCalls++; return 1; },
    setCurrentDevice: () => 1,
    relayConnectionState: { state: 'stopped', since: Date.now() }
  });
  const runtime = new RimSignalProtocolRuntime({
    getUser: () => ({ id: 'existing-user' }), environment: browserEnv(),
    relayFactory: async () => relay,
    importSdk: async () => ({ createSignalProtocolClient: async () => { throw new Error('must not create'); } }),
    importWebSqliteStore: async () => ({ webSqliteStore: async () => ({ hasIdentityKey: async () => false, close() {} }) }),
  });
  await assert.rejects(() => runtime.initialize(), /уже есть основное E2E-устройство/);
  assert.equal(registrationCalls, 0);
});

test('Signal Protocol runtime closes the previous account client before opening a different account database', async () => {
  let userId = 'account-a';
  const order = [];
  let sequence = 0;
  const runtime = new RimSignalProtocolRuntime({
    getUser: () => ({ id: userId }), environment: browserEnv(),
    relayFactory: async () => Object.assign(Object.fromEntries([
      'send','subscribe','subscribeRelayConnectionState','markDelivered','removeDevice','setCurrentDevice',
      'provisionIdentityKey','rotateIdentityKey','getIdentityKey','uploadPreKeys','fetchPreKeyBundle','getPreKeyCount',
      'getPreKeyInventory','clearStaleKemPreKeys','publishPlannedPreKeys','getActiveDevices',
      'getEcSignedPreKeyMetadata','getKemLastResortPreKeyMetadata'
    ].map(name => [name, async () => true])), {
      getDevices: async () => [], registerDevice: async () => 1, setCurrentDevice: () => 1,
      relayConnectionState: { state: 'stopped', since: Date.now() }
    }),
    importSdk: async () => ({ createSignalProtocolClient: async () => {
      const id = ++sequence;
      order.push(`create-${id}`);
      return { stop: async () => order.push(`stop-${id}`), close: async () => order.push(`client-close-${id}`) };
    } }),
    importWebSqliteStore: async () => ({ webSqliteStore: async () => ({ hasIdentityKey: async () => false, close: async () => order.push(`store-close-${sequence}`) }) }),
  });
  try {
    await runtime.initialize();
    userId = 'account-b';
    await runtime.initialize();
    assert.deepEqual(order.slice(0, 4), ['create-1', 'stop-1', 'client-close-1', 'store-close-1']);
    assert.equal(runtime.userId, 'account-b');
  } finally { await runtime.dispose(); }
});

test('Signal Protocol runtime never writes an accepted old-account message into the newly active account cache', async () => {
  let userId = 'account-a';
  let writes = 0;
  const client = {
    send: async (recipient, content, options) => {
      userId = 'account-b';
      return { recipient, content, options, messageId: 'accepted-before-switch', clientTimestamp: options.timestamp };
    }
  };
  const relay = Object.assign(Object.fromEntries([
    'send','subscribe','subscribeRelayConnectionState','markDelivered','removeDevice','setCurrentDevice',
    'provisionIdentityKey','rotateIdentityKey','getIdentityKey','uploadPreKeys','fetchPreKeyBundle','getPreKeyCount',
    'getPreKeyInventory','clearStaleKemPreKeys','publishPlannedPreKeys','getActiveDevices',
    'getEcSignedPreKeyMetadata','getKemLastResortPreKeyMetadata'
  ].map(name => [name, async () => true])), {
    getDevices: async () => [], registerDevice: async () => 1, setCurrentDevice: () => 1,
    relayConnectionState: { state: 'stopped', since: Date.now() }
  });
  const runtime = new RimSignalProtocolRuntime({
    getUser: () => ({ id: userId }), environment: browserEnv(), relayFactory: async () => relay,
    importSdk: async () => ({ createSignalProtocolClient: async () => client }),
    importWebSqliteStore: async () => ({ webSqliteStore: async () => ({ close() {}, hasIdentityKey: async () => false }) }),
    messageStore: { put: async () => { writes++; }, getConversation: async () => [] }
  });
  try {
    await runtime.initialize();
    const result = await runtime.sendDirect('peer-b', 'secret', { conversationId: 'direct-1', clientMessageId: 'switch-send-1' });
    assert.equal(result.accountChanged, true);
    assert.equal(result.localPersisted, false);
    assert.equal(writes, 0);
  } finally { await runtime.dispose(); }
});

test('Signal Protocol runtime aborts a stale account initialization while SDK modules are loading', async () => {
  let userId = 'account-a';
  let resolveSdk;
  let storageOpens = 0;
  const sdkPending = new Promise(resolve => { resolveSdk = resolve; });
  const runtime = new RimSignalProtocolRuntime({
    getUser: () => ({ id: userId }), environment: browserEnv(),
    importSdk: () => sdkPending,
    importWebSqliteStore: async () => ({ webSqliteStore: async () => { storageOpens++; return { close() {} }; } })
  });
  const pending = runtime.initialize();
  await Promise.resolve();
  userId = 'account-b';
  resolveSdk({ createSignalProtocolClient: async () => ({}) });
  await assert.rejects(pending, /Аккаунт изменился во время инициализации E2E/);
  assert.equal(storageOpens, 0);
  assert.equal(runtime.client, null);
  assert.equal(runtime.userId, null);
});

test('Signal Protocol runtime closes a client created after its account became stale', async () => {
  let userId = 'account-a';
  const order = [];
  const runtime = new RimSignalProtocolRuntime({
    getUser: () => ({ id: userId }), environment: browserEnv(),
    importSdk: async () => ({ createSignalProtocolClient: async () => {
      userId = 'account-b';
      return { stop: async () => order.push('client-stop'), close: async () => order.push('client-close') };
    } }),
    importWebSqliteStore: async () => ({ webSqliteStore: async () => ({ close: async () => order.push('storage-close') }) })
  });
  await assert.rejects(() => runtime.initialize(), /завершение создания криптографического клиента/);
  assert.deepEqual(order, ['client-stop', 'client-close', 'storage-close']);
  assert.equal(runtime.client, null);
  assert.equal(runtime.storage, null);
  assert.equal(runtime.userId, null);
});

test('Signal Protocol runtime serializes concurrent waiters after an account switch', async () => {
  let userId = 'account-a';
  let resolveFirstImport;
  let importCalls = 0;
  let clientCreates = 0;
  const firstImport = new Promise(resolve => { resolveFirstImport = resolve; });
  const sdk = { createSignalProtocolClient: async () => ({ id: ++clientCreates }) };
  const runtime = new RimSignalProtocolRuntime({
    getUser: () => ({ id: userId }), environment: browserEnv(),
    importSdk: () => (++importCalls === 1 ? firstImport : Promise.resolve(sdk)),
    importWebSqliteStore: async () => ({ webSqliteStore: async () => ({ close() {} }) })
  });
  const stale = runtime.initialize();
  await Promise.resolve();
  userId = 'account-b';
  const waiterOne = runtime.initialize();
  const waiterTwo = runtime.initialize();
  resolveFirstImport(sdk);
  await assert.rejects(stale, /Аккаунт изменился во время инициализации E2E/);
  const [clientOne, clientTwo] = await Promise.all([waiterOne, waiterTwo]);
  assert.equal(clientOne, clientTwo);
  assert.equal(clientCreates, 1);
  assert.equal(importCalls, 2);
  assert.equal(runtime.userId, 'account-b');
  await runtime.dispose();
});

test('Signal Protocol runtime deduplicates concurrent disposal when switching an established account', async () => {
  let userId = 'account-a';
  let stopCalls = 0;
  let createCalls = 0;
  const runtime = new RimSignalProtocolRuntime({
    getUser: () => ({ id: userId }), environment: browserEnv(),
    importSdk: async () => ({ createSignalProtocolClient: async () => {
      const id = ++createCalls;
      return { stop: async () => { if (id === 1) stopCalls++; }, close() {} };
    } }),
    importWebSqliteStore: async () => ({ webSqliteStore: async () => ({ close() {} }) })
  });
  await runtime.initialize();
  userId = 'account-b';
  const [clientOne, clientTwo] = await Promise.all([runtime.initialize(), runtime.initialize()]);
  assert.equal(clientOne, clientTwo);
  assert.equal(stopCalls, 1);
  assert.equal(createCalls, 2);
  assert.equal(runtime.userId, 'account-b');
  await runtime.dispose();
});

test('Signal Protocol runtime disposal invalidates an in-flight initialization even when the account stays the same', async () => {
  let resolveSdk;
  let storageOpens = 0;
  const sdkPending = new Promise(resolve => { resolveSdk = resolve; });
  const runtime = new RimSignalProtocolRuntime({
    getUser: () => ({ id: 'account-a' }), environment: browserEnv(),
    importSdk: () => sdkPending,
    importWebSqliteStore: async () => ({ webSqliteStore: async () => { storageOpens++; return { close() {} }; } })
  });
  const pending = runtime.initialize();
  await Promise.resolve();
  await runtime.dispose();
  resolveSdk({ createSignalProtocolClient: async () => ({}) });
  await assert.rejects(pending, /Инициализация E2E отменена закрытием runtime/);
  assert.equal(storageOpens, 0);
  assert.equal(runtime.client, null);
  assert.equal(runtime.storage, null);
  assert.equal(runtime.userId, null);
});

test('Signal Protocol runtime does not restart relay subscription after disposal during initial sync', async () => {
  let resolveSync;
  let syncStarted = false;
  let subscriptions = 0;
  const relay = Object.assign(Object.fromEntries([
    'send','subscribe','subscribeRelayConnectionState','markDelivered','removeDevice','setCurrentDevice',
    'provisionIdentityKey','rotateIdentityKey','getIdentityKey','uploadPreKeys','fetchPreKeyBundle','getPreKeyCount',
    'getPreKeyInventory','clearStaleKemPreKeys','publishPlannedPreKeys','getActiveDevices',
    'getEcSignedPreKeyMetadata','getKemLastResortPreKeyMetadata'
  ].map(name => [name, async () => true])), {
    getDevices: async () => [], registerDevice: async () => 1, setCurrentDevice: () => 1,
    relayConnectionState: { state: 'stopped', since: Date.now() }
  });
  const runtime = new RimSignalProtocolRuntime({
    getUser: () => ({ id: 'account-a' }), environment: browserEnv(), relayFactory: async () => relay,
    importSdk: async () => ({ createSignalProtocolClient: async () => ({
      syncToServer: async () => { syncStarted = true; await new Promise(resolve => { resolveSync = resolve; }); },
      startRelaySubscription: () => { subscriptions++; },
      stop: async () => {}, close: async () => {}
    }) }),
    importWebSqliteStore: async () => ({ webSqliteStore: async () => ({ close: async () => {}, hasIdentityKey: async () => false }) })
  });
  const starting = runtime.startIncoming();
  while (!syncStarted) await new Promise(resolve => setImmediate(resolve));
  await runtime.dispose();
  resolveSync();
  await assert.rejects(starting, /Инициализация E2E отменена закрытием runtime/);
  assert.equal(subscriptions, 0);
  assert.equal(runtime.client, null);
  assert.equal(runtime.protocolReady, false);
});


test('Signal Protocol runtime binds the existing registered primary device to the relay after a browser restart', async () => {
  const selected = [];
  const relay = Object.assign(Object.fromEntries([
    'send','subscribe','subscribeRelayConnectionState','markDelivered','removeDevice','setCurrentDevice',
    'provisionIdentityKey','rotateIdentityKey','getIdentityKey','uploadPreKeys','fetchPreKeyBundle','getPreKeyCount',
    'getPreKeyInventory','clearStaleKemPreKeys','publishPlannedPreKeys','getActiveDevices',
    'getEcSignedPreKeyMetadata','getKemLastResortPreKeyMetadata'
  ].map(name => [name, async () => true])), {
    getDevices: async () => [{ deviceId: 1, registered: true, enabled: true, status: 'active' }],
    registerDevice: async () => { throw new Error('existing device must not be re-registered'); },
    setCurrentDevice: (userId, deviceId) => { selected.push([userId, deviceId]); return deviceId; },
    relayConnectionState: { state: 'stopped', since: Date.now() }
  });
  const runtime = new RimSignalProtocolRuntime({
    getUser: () => ({ id: 'returning-user' }), environment: browserEnv(), relayFactory: async () => relay,
    importSdk: async () => ({ createSignalProtocolClient: async () => ({}) }),
    importWebSqliteStore: async () => ({ webSqliteStore: async () => ({ hasIdentityKey: async () => true, close() {} }) })
  });
  try {
    await runtime.initialize();
    assert.deepEqual(selected, [['returning-user', 1]]);
    assert.equal(runtime.userId, 'returning-user');
  } finally { await runtime.dispose(); }
});

test('Signal Protocol runtime coalesces concurrent incoming starts and keeps subscription idempotent', async () => {
  const calls = [];
  let releaseSync;
  const syncGate = new Promise(resolve => { releaseSync = resolve; });
  const relay = Object.assign(Object.fromEntries([
    'send','subscribe','subscribeRelayConnectionState','markDelivered','removeDevice','setCurrentDevice',
    'provisionIdentityKey','rotateIdentityKey','getIdentityKey','uploadPreKeys','fetchPreKeyBundle','getPreKeyCount',
    'getPreKeyInventory','clearStaleKemPreKeys','publishPlannedPreKeys','getActiveDevices',
    'getEcSignedPreKeyMetadata','getKemLastResortPreKeyMetadata'
  ].map(name => [name, async () => true])), {
    getDevices: async () => [], registerDevice: async () => 1, setCurrentDevice: () => 1,
    relayConnectionState: { state: 'stopped', since: Date.now() }
  });
  const runtime = new RimSignalProtocolRuntime({
    getUser: () => ({ id: 'account-a' }), environment: browserEnv(), relayFactory: async () => relay,
    importSdk: async () => ({ createSignalProtocolClient: async () => ({
      syncToServer: async () => { calls.push('sync-start'); await syncGate; calls.push('sync-end'); },
      startRelaySubscription: async () => { calls.push('subscribe'); }
    }) }),
    importWebSqliteStore: async () => ({ webSqliteStore: async () => ({ close() {}, hasIdentityKey: async () => false }) })
  });
  try {
    const first = runtime.startIncoming();
    const second = runtime.startIncoming();
    assert.strictEqual(first, second, 'parallel startup callers should share one promise');
    while (!calls.includes('sync-start')) await new Promise(resolve => setImmediate(resolve));
    releaseSync();
    const [a, b] = await Promise.all([first, second]);
    assert.deepEqual(a, b);
    assert.deepEqual(calls, ['sync-start', 'sync-end', 'subscribe']);
    const again = await runtime.startIncoming();
    assert.deepEqual(again, a);
    assert.deepEqual(calls, ['sync-start', 'sync-end', 'subscribe']);
    assert.equal(runtime.protocolReady, false);
  } finally { releaseSync(); await runtime.dispose(); }
});

test('Signal Protocol runtime permits a clean incoming-start retry after SDK subscription failure', async () => {
  let subscriptions = 0;
  const relay = Object.assign(Object.fromEntries([
    'send','subscribe','subscribeRelayConnectionState','markDelivered','removeDevice','setCurrentDevice',
    'provisionIdentityKey','rotateIdentityKey','getIdentityKey','uploadPreKeys','fetchPreKeyBundle','getPreKeyCount',
    'getPreKeyInventory','clearStaleKemPreKeys','publishPlannedPreKeys','getActiveDevices',
    'getEcSignedPreKeyMetadata','getKemLastResortPreKeyMetadata'
  ].map(name => [name, async () => true])), {
    getDevices: async () => [], registerDevice: async () => 1, setCurrentDevice: () => 1,
    relayConnectionState: { state: 'stopped', since: Date.now() }
  });
  const runtime = new RimSignalProtocolRuntime({
    getUser: () => ({ id: 'account-a' }), environment: browserEnv(), relayFactory: async () => relay,
    importSdk: async () => ({ createSignalProtocolClient: async () => ({
      syncToServer: async () => {},
      startRelaySubscription: async () => { subscriptions += 1; if (subscriptions === 1) throw new Error('temporary subscription failure'); }
    }) }),
    importWebSqliteStore: async () => ({ webSqliteStore: async () => ({ close() {}, hasIdentityKey: async () => false }) })
  });
  try {
    await assert.rejects(() => runtime.startIncoming(), /temporary subscription failure/);
    const result = await runtime.startIncoming();
    assert.equal(result.protocolReady, false);
    assert.equal(subscriptions, 2);
  } finally { await runtime.dispose(); }
});

test('Signal Protocol runtime can restart incoming delivery after disposal while an old sync is still pending', async () => {
  let resolveOldSync;
  let syncCount = 0;
  let subscriptionCount = 0;
  let clientCount = 0;
  const relay = Object.assign(Object.fromEntries([
    'send','subscribe','subscribeRelayConnectionState','markDelivered','removeDevice','setCurrentDevice',
    'provisionIdentityKey','rotateIdentityKey','getIdentityKey','uploadPreKeys','fetchPreKeyBundle','getPreKeyCount',
    'getPreKeyInventory','clearStaleKemPreKeys','publishPlannedPreKeys','getActiveDevices',
    'getEcSignedPreKeyMetadata','getKemLastResortPreKeyMetadata'
  ].map(name => [name, async () => true])), {
    getDevices: async () => [], registerDevice: async () => 1, setCurrentDevice: () => 1,
    relayConnectionState: { state: 'stopped', since: Date.now() }
  });
  const runtime = new RimSignalProtocolRuntime({
    getUser: () => ({ id: 'account-a' }), environment: browserEnv(), relayFactory: async () => relay,
    importSdk: async () => ({ createSignalProtocolClient: async () => {
      const id = ++clientCount;
      return {
        syncToServer: async () => {
          syncCount += 1;
          if (id === 1) await new Promise(resolve => { resolveOldSync = resolve; });
        },
        startRelaySubscription: () => { subscriptionCount += 1; },
        stop: async () => {}, close: async () => {}
      };
    } }),
    importWebSqliteStore: async () => ({ webSqliteStore: async () => ({ close: async () => {}, hasIdentityKey: async () => false }) })
  });
  const oldStart = runtime.startIncoming();
  while (!resolveOldSync) await new Promise(resolve => setImmediate(resolve));
  const teardown = runtime.dispose();
  const newStart = runtime.startIncoming();
  await teardown;
  const result = await newStart;
  resolveOldSync();
  await assert.rejects(oldStart, /Инициализация E2E отменена закрытием runtime/);
  assert.equal(result.protocolReady, false);
  assert.equal(clientCount, 2);
  assert.equal(syncCount, 2);
  assert.equal(subscriptionCount, 1);
  await runtime.dispose();
});

test('Signal Protocol runtime detaches a subscription that finishes attaching after disposal', async () => {
  let releaseSubscription;
  let subscriptionStarted = false;
  let subscriptionActive = false;
  let detachCalls = 0;
  const relay = Object.assign(Object.fromEntries([
    'send','subscribe','subscribeRelayConnectionState','markDelivered','removeDevice','setCurrentDevice',
    'provisionIdentityKey','rotateIdentityKey','getIdentityKey','uploadPreKeys','fetchPreKeyBundle','getPreKeyCount',
    'getPreKeyInventory','clearStaleKemPreKeys','publishPlannedPreKeys','getActiveDevices',
    'getEcSignedPreKeyMetadata','getKemLastResortPreKeyMetadata'
  ].map(name => [name, async () => true])), {
    getDevices: async () => [], registerDevice: async () => 1, setCurrentDevice: () => 1,
    relayConnectionState: { state: 'stopped', since: Date.now() }
  });
  const runtime = new RimSignalProtocolRuntime({
    getUser: () => ({ id: 'account-a' }), environment: browserEnv(), relayFactory: async () => relay,
    importSdk: async () => ({ createSignalProtocolClient: async () => ({
      syncToServer: async () => {},
      startRelaySubscription: async () => {
        subscriptionStarted = true;
        await new Promise(resolve => { releaseSubscription = resolve; });
        subscriptionActive = true;
      },
      stopRelaySubscription: async () => { detachCalls += 1; subscriptionActive = false; },
      stop: async () => { subscriptionActive = false; },
      close: async () => {}
    }) }),
    importWebSqliteStore: async () => ({ webSqliteStore: async () => ({ close: async () => {}, hasIdentityKey: async () => false }) })
  });
  const starting = runtime.startIncoming();
  while (!subscriptionStarted) await new Promise(resolve => setImmediate(resolve));
  await runtime.dispose();
  releaseSubscription();
  await assert.rejects(starting, /Инициализация E2E отменена закрытием runtime/);
  assert.equal(subscriptionActive, false);
  assert.equal(detachCalls, 1);
  assert.equal(runtime.client, null);
  assert.equal(runtime.protocolReady, false);
});
