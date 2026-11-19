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
