import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageCommandService } from '../src/application/message-command-service.js';
import { Ok, Err } from '../src/core/result.js';

function fixture(overrides = {}) {
  const state = {
    user: { id: 'user-1' }, conversation: { id: 'conversation-1', type: 'group' },
    reply: { id: 'reply-1' }, topic: 'topic-1', messages: [{ id: 'm1', conversation_id: 'conversation-1', body: 'original' }], inserted: [], updated: [], removed: [],
    reloads: 0, cleared: 0, notices: [], uploads: [], removals: [], allow: true
  };
  const repository = {
    async insert(payload) { state.inserted.push(payload); return overrides.insert ? overrides.insert(payload, state) : Ok({ id: `m-${state.inserted.length}`, ...payload }); },
    async update(id, userId, body, conversationId) { state.updated.push({ id, userId, body, conversationId }); return overrides.update ? overrides.update(id, userId, body) : Ok({ id, body }); },
    async remove(id, userId, conversationId) { state.removed.push({ id, userId, conversationId }); return overrides.remove ? overrides.remove(id, userId) : Ok({ id }); }
  };
  const storage = { from(bucket) { assert.equal(bucket, 'chat-files'); return {
    async upload(path, file, options) { state.uploads.push({ path, file, options }); return overrides.upload ? overrides.upload(path, file, options) : { error: null }; },
    async remove(paths) { state.removals.push(paths); return overrides.cleanup ? overrides.cleanup(paths) : { error: null }; }
  }; } };
  const service = new MessageCommandService({
    repository, storage, getUser: () => state.user, getConversation: () => state.conversation,
    getReplyTarget: () => state.reply, getTopicId: () => state.topic, getMessages: () => state.messages,
    canSend: async () => state.allow, notify: value => state.notices.push(value),
    reload: async () => { state.reloads++; }, clearReply: () => { state.cleared++; }
  });
  return { service, state };
}

test('text send validates content and 4000-character database limit', async () => {
  const { service, state } = fixture();
  assert.equal((await service.sendText('   ')).ok, false);
  assert.equal((await service.sendText('x'.repeat(4001))).ok, false);
  assert.equal(state.inserted.length, 0);
});

test('text send persists sender, conversation, reply and topic then refreshes', async () => {
  const { service, state } = fixture();
  const result = await service.sendText('  Привет  ');
  assert.equal(result.ok, true);
  assert.deepEqual(state.inserted[0], { conversation_id: 'conversation-1', sender_id: 'user-1', body: 'Привет', reply_to_message_id: 'reply-1', topic_id: 'topic-1' });
  assert.equal(state.cleared, 1);
  assert.equal(state.reloads, 1);
});

test('send is protected from concurrent duplicate submissions', async () => {
  let release;
  const { service, state } = fixture({ insert: () => new Promise(resolve => { release = () => resolve(Ok({ id: 'm1' })); }) });
  const first = service.sendText('hello');
  await Promise.resolve(); await Promise.resolve();
  const second = await service.sendText('hello');
  assert.equal(second.ok, false);
  assert.match(second.error.message, /уже выполняется/i);
  release();
  assert.equal((await first).ok, true);
  assert.equal(state.inserted.length, 1);
});

test('blocked or unavailable direct-send preflight fails closed', async () => {
  const { service, state } = fixture(); state.allow = new Error('blocked');
  const result = await service.sendText('hello');
  assert.equal(result.ok, false);
  assert.equal(state.inserted.length, 0);
});

test('sticker send includes active topic and refreshes without clearing reply', async () => {
  const { service, state } = fixture();
  const result = await service.sendSticker('⚜');
  assert.equal(result.ok, true);
  assert.equal(state.inserted[0].sticker_id, '⚜');
  assert.equal(state.inserted[0].topic_id, 'topic-1');
  assert.equal(state.cleared, 0);
});

test('image send validates MIME and size before storage access', async () => {
  const { service, state } = fixture();
  assert.equal((await service.sendImage({ type: 'image/svg+xml', size: 10, name: 'x.svg' })).ok, false);
  assert.equal((await service.sendImage({ type: 'image/png', size: 5 * 1024 * 1024 + 1, name: 'x.png' })).ok, false);
  assert.equal(state.uploads.length, 0);
});

test('image send uploads a MIME-derived safe extension and inserts matching path', async () => {
  const { service, state } = fixture();
  const file = { type: 'image/jpeg', size: 100, name: '../../fake.png' };
  const result = await service.sendImage(file);
  assert.equal(result.ok, true);
  assert.match(state.uploads[0].path, /^user-1\/conversation-1\/[\w-]+\.jpg$/);
  assert.equal(state.inserted[0].image_path, state.uploads[0].path);
  assert.equal(state.uploads[0].options.upsert, false);
  assert.equal(state.cleared, 1);
  assert.equal(state.reloads, 1);
});

test('failed image message insert attempts to remove only the newly uploaded object', async () => {
  const { service, state } = fixture({ insert: async () => Err(new Error('insert denied')) });
  const result = await service.sendImage({ type: 'image/png', size: 100, name: 'x.png' });
  assert.equal(result.ok, false);
  assert.equal(state.removals.length, 1);
  assert.equal(state.removals[0][0], state.uploads[0].path);
});

test('edit and delete are scoped to the current authenticated user', async () => {
  const { service, state } = fixture();
  assert.equal((await service.edit('m1', 'edited')).ok, true);
  assert.equal((await service.remove('m1')).ok, true);
  assert.deepEqual(state.updated[0], { id: 'm1', userId: 'user-1', body: 'edited', conversationId: 'conversation-1' });
  assert.deepEqual(state.removed[0], { id: 'm1', userId: 'user-1', conversationId: 'conversation-1' });
});

test('edit and delete reject messages outside the active conversation', async () => {
  const { service, state } = fixture();
  state.messages = [{ id: 'other', conversation_id: 'conversation-2' }];
  assert.equal((await service.edit('other', 'x')).ok, false);
  assert.equal((await service.remove('other')).ok, false);
  assert.equal(state.updated.length, 0);
  assert.equal(state.removed.length, 0);
});

test('refresh failure after a successful insert does not report the send as failed', async () => {
  const { service } = fixture();
  service.reload = async () => { throw new Error('render failed'); };
  const result = await service.sendText('committed');
  assert.equal(result.ok, true);
});

test('successful mutation does not reload a different conversation after navigation', async () => {
  let state;
  const { service, state: local } = fixture({ insert: async (_payload) => { local.conversation = { id: 'conversation-2', type: 'group' }; return Ok({ id: 'm1' }); } });
  state = local;
  const result = await service.sendText('hello');
  assert.equal(result.ok, true);
  assert.equal(state.reloads, 0);
  assert.equal(state.cleared, 0);
});


test('E2E-required direct scope blocks legacy plaintext insertion while protocol is not ready', async () => {
  const { service, state } = fixture();
  state.conversation = { id: 'direct-1', type: 'direct' };
  service.e2eScopeRepository = {
    async getScope() {
      return Ok({ enabled: true, readiness: { ready: false, reason: 'E2E-протокол ещё не готов.' } });
    }
  };
  const result = await service.sendText('секретное сообщение');
  assert.equal(result.ok, false);
  assert.match(result.error.message, /E2E-протокол ещё не готов/);
  assert.equal(state.inserted.length, 0);
});

test('E2E scope lookup errors block plaintext direct-message fallback', async () => {
  const { service, state } = fixture();
  state.conversation = { id: 'direct-1', type: 'direct' };
  service.e2eScopeRepository = { async getScope() { return Err(new Error('scope lookup unavailable')); } };
  const result = await service.sendText('do not leak');
  assert.equal(result.ok, false);
  assert.match(result.error.message, /scope lookup unavailable/);
  assert.equal(state.inserted.length, 0);
});

test('legacy direct conversations remain compatible when E2E mode is off', async () => {
  const { service, state } = fixture();
  state.conversation = { id: 'direct-1', type: 'direct' };
  service.e2eScopeRepository = { async getScope() { return Ok({ enabled: false, readiness: { ready: false } }); } };
  const result = await service.sendText('обычное сообщение');
  assert.equal(result.ok, true);
  assert.equal(state.inserted.length, 1);
  assert.equal(state.inserted[0].body, 'обычное сообщение');
});

test('outbox retry cannot leak plaintext into an E2E-required direct scope', async () => {
  const { service, state } = fixture();
  service.e2eScopeRepository = { async getScope() { return Ok({ enabled: true, readiness: { ready: false, reason: 'E2E scope required.' } }); } };
  const result = await service.sendText('queued secret', { fromOutbox: true, conversationId: 'direct-1', conversationType: 'direct', expectedUserId: 'user-1' });
  assert.equal(result.ok, false);
  assert.match(result.error.message, /E2E scope required/);
  assert.equal(state.inserted.length, 0);
});

test('required direct scope routes through E2E runtime and never inserts plaintext', async () => {
  const state = { inserted: [], local: [{ messageId: 'e2e-1', body: 'secret', timestamp: 1700000000000, replyTo: 'reply-1' }], applied: [] };
  const service = new MessageCommandService({
    repository: { insert: async payload => { state.inserted.push(payload); return Ok({ id: 'plain-1' }); } },
    getUser: () => ({ id: 'user-a' }), getConversation: () => ({ id: 'direct-1', type: 'direct' }),
    getReplyTarget: () => ({ id: 'reply-1' }), getMessages: () => [],
    e2eScopeRepository: { getScope: async () => Ok({ enabled: true, readiness: { ready: true }, peerUserId: 'user-b' }) },
    e2eRuntime: {
      sendDirect: async (peer, body, options) => {
        assert.equal(peer, 'user-b'); assert.equal(body, 'secret');
        assert.equal(options.conversationId, 'direct-1'); assert.equal(options.replyTo, 'reply-1');
        return { messageId: 'e2e-1' };
      },
      getLocalConversation: async () => state.local
    },
    applyLocal: async message => state.applied.push(message), clearReply: () => {}
  });
  const result = await service.sendText('secret');
  assert.equal(result.ok, true);
  assert.equal(result.value._rimE2E, true);
  assert.equal(result.value._rimLocalOnly, true);
  assert.equal(state.inserted.length, 0);
  assert.equal(state.applied.length, 1);
});

test('required direct scope with unready protocol fails closed without plaintext fallback', async () => {
  const inserted = [];
  const service = new MessageCommandService({
    repository: { insert: async payload => { inserted.push(payload); return Ok({ id: 'plain-1' }); } },
    getUser: () => ({ id: 'user-a' }), getConversation: () => ({ id: 'direct-1', type: 'direct' }),
    getReplyTarget: () => null, getMessages: () => [],
    e2eScopeRepository: { getScope: async () => Ok({ enabled: true, readiness: { ready: false, reason: 'protocol pending' } }) }
  });
  const result = await service.sendText('secret');
  assert.equal(result.ok, false);
  assert.match(result.error.message, /protocol pending/);
  assert.equal(inserted.length, 0);
});

test('required direct scope blocks sticker and image plaintext paths before upload or insert', async () => {
  const inserted = []; const uploaded = [];
  const service = new MessageCommandService({
    repository: { insert: async payload => { inserted.push(payload); return Ok({ id: 'plain' }); } },
    storage: { from: () => ({ upload: async (...args) => { uploaded.push(args); return { error: null }; } }) },
    getUser: () => ({ id: 'user-a' }), getConversation: () => ({ id: 'direct-1', type: 'direct' }),
    getReplyTarget: () => null, getTopicId: () => null,
    e2eScopeRepository: { getScope: async () => Ok({ enabled: true, readiness: { ready: false, reason: 'E2E required' } }) }
  });
  assert.equal((await service.sendSticker('⚜')).ok, false);
  assert.equal((await service.sendImage({ type: 'image/png', size: 10, name: 'a.png' })).ok, false);
  assert.equal(inserted.length, 0);
  assert.equal(uploaded.length, 0);
});

test('local E2E messages cannot be edited, deleted or reacted to through legacy APIs', async () => {
  const local = { id: 'e2e-1', conversation_id: 'conversation-1', _rimE2E: true, _rimLocalOnly: true, body: 'secret' };
  const { service, state } = fixture();
  service.getMessages = () => [local];
  assert.equal((await service.edit('e2e-1', 'changed')).ok, false);
  assert.equal((await service.remove('e2e-1')).ok, false);
  assert.equal((await service.react('e2e-1', '👍')).ok, false);
  assert.equal(state.updated.length, 0);
  assert.equal(state.removed.length, 0);
});

test('private E2E-required group blocks legacy plaintext text path', async () => {
  const { service, state } = fixture();
  state.conversation = { id: 'private-group-1', type: 'group', is_private: true };
  service.e2eScopeRepository = {
    async getScope(scope) {
      assert.deepEqual(scope, { type: 'group', id: 'private-group-1', is_private: true });
      return Ok({ enabled: true, readiness: { ready: false, reason: 'E2E group protocol pending' } });
    }
  };
  const result = await service.sendText('group secret');
  assert.equal(result.ok, false);
  assert.match(result.error.message, /E2E group protocol pending/);
  assert.equal(state.inserted.length, 0);
});

test('private E2E-required group blocks sticker and image before storage or insert', async () => {
  const { service, state } = fixture();
  state.conversation = { id: 'private-group-1', type: 'group', is_private: true };
  service.e2eScopeRepository = { async getScope() { return Ok({ enabled: true, readiness: { ready: false } }); } };
  assert.equal((await service.sendSticker('⚜')).ok, false);
  assert.equal((await service.sendImage({ type: 'image/png', size: 100, name: 'secret.png' })).ok, false);
  assert.equal(state.inserted.length, 0);
  assert.equal(state.uploads.length, 0);
});

test('plaintext outbox refuses E2E-required direct and private group scopes', async () => {
  const { service, state } = fixture();
  state.conversation = { id: 'direct-1', type: 'direct' };
  service.e2eScopeRepository = { async getScope() { return Ok({ enabled: true }); } };
  let result = await service.canQueuePlaintextOutbox(state.conversation, state.user);
  assert.equal(result.ok, false);
  assert.match(result.error.message, /не сохранён в офлайн-очереди/i);
  state.conversation = { id: 'private-group-1', type: 'group', is_private: true };
  result = await service.canQueuePlaintextOutbox(state.conversation, state.user);
  assert.equal(result.ok, false);
});

test('plaintext outbox fails closed when E2E scope lookup or group privacy is unavailable', async () => {
  const { service, state } = fixture();
  state.conversation = { id: 'direct-1', type: 'direct' };
  service.e2eScopeRepository = { async getScope() { return Err(new Error('scope network timeout')); } };
  let result = await service.canQueuePlaintextOutbox(state.conversation, state.user);
  assert.equal(result.ok, false);
  assert.match(result.error.message, /scope network timeout/);
  state.conversation = { id: 'group-1', type: 'group' };
  result = await service.canQueuePlaintextOutbox(state.conversation, state.user);
  assert.equal(result.ok, false);
  assert.match(result.error.message, /подтвердить приватность/i);
});

test('plaintext outbox remains available for verified legacy direct scope', async () => {
  const { service, state } = fixture();
  state.conversation = { id: 'direct-1', type: 'direct' };
  service.e2eScopeRepository = { async getScope() { return Ok({ enabled: false }); } };
  const result = await service.canQueuePlaintextOutbox(state.conversation, state.user);
  assert.equal(result.ok, true);
});

test('legacy public-group outbox retry retains verified public privacy state', async () => {
  const { service, state } = fixture();
  service.e2eScopeRepository = { async getScope(scope) {
    assert.deepEqual(scope, { type: 'group', id: 'public-group', is_private: false });
    return Ok({ enabled: false });
  } };
  const result = await service.sendText('queued public group message', {
    fromOutbox: true, conversationId: 'public-group', conversationType: 'group', conversationIsPrivate: false,
    expectedUserId: 'user-1'
  });
  assert.equal(result.ok, true);
  assert.equal(state.inserted.length, 1);
});

test('image send removes uploaded object and skips message insert if account changes during upload', async () => {
  let releaseUpload;
  const { service, state } = fixture({ upload: async () => new Promise(resolve => { releaseUpload = () => resolve({ error: null }); }) });
  const pending = service.sendImage({ type: 'image/png', size: 100, name: 'x.png' });
  while (!releaseUpload) await new Promise(resolve => setImmediate(resolve));
  state.user = { id: 'user-2' };
  releaseUpload();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.match(result.error.message, /изменились во время загрузки/i);
  assert.equal(state.inserted.length, 0);
  assert.equal(state.removals.length, 1);
  assert.equal(state.removals[0][0], state.uploads[0].path);
});

test('required private group sends encrypted fan-out and never inserts plaintext', async () => {
  const state = { inserted: [], sent: [] };
  const repository = {
    insert: async payload => { state.inserted.push(payload); return Ok({ id: 'plain-1', ...payload }); }
  };
  const service = new MessageCommandService({
    repository, getUser: () => ({ id: 'user-a' }),
    getConversation: () => ({ id: 'group-e2e', type: 'group', is_private: true }),
    getReplyTarget: () => null, getTopicId: () => null, getMessages: () => [],
    e2eScopeRepository: { getScope: async () => Ok({ enabled: true, readiness: { ready: true, missingUserIds: [] }, memberUserIds: ['user-a', 'user-b', 'user-c'] }) },
    e2eRuntime: {
      sendGroup: async (members, body, options) => {
        state.sent.push({ members, body, options });
        return { messageId: 'e2e-group-1', localMessage: { messageId: 'e2e-group-1', body, timestamp: Date.now() }, localPersisted: true, acceptedRecipientCount: 2, failedRecipientCount: 0 };
      },
      getLocalConversation: async () => [{ messageId: 'e2e-group-1', body: 'encrypted group text', timestamp: Date.now() }]
    },
    canSend: async () => true, notify: () => {}, reload: async () => {}, clearReply: () => {}
  });
  const result = await service.sendText('encrypted group text');
  assert.equal(result.ok, true);
  assert.equal(state.sent.length, 1);
  assert.deepEqual(state.sent[0].members, ['user-a', 'user-b', 'user-c']);
  assert.equal(state.sent[0].options.conversationId, 'group-e2e');
  assert.equal(state.inserted.length, 0);
});
