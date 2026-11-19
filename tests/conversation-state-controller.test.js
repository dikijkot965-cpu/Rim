import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationStateController, compareConversations, messagePreview } from '../src/application/conversation-state-controller.js';
import { Ok } from '../src/core/result.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('conversation activity ordering prefers last message time over conversation creation', () => {
  const rows = [
    { id: 'old', created_at: '2026-01-01T00:00:00Z' },
    { id: 'active', created_at: '2026-01-02T00:00:00Z', last_message_at: '2026-02-01T00:00:00Z' },
    { id: 'realtime', created_at: '2025-01-01T00:00:00Z', _rimLastMessageAt: '2026-03-01T00:00:00Z' }
  ];
  rows.sort(compareConversations);
  assert.deepEqual(rows.map(row => row.id), ['realtime', 'active', 'old']);
});

test('message preview normalizes text and labels common attachment types', () => {
  assert.equal(messagePreview({ body: '  Привет\n   мир  ' }), 'Привет мир');
  assert.equal(messagePreview({ image_path: 'a.webp' }), 'Фото');
  assert.equal(messagePreview({ attachment_path: 'a.pdf', attachment_name: 'Документ.pdf' }), 'Файл: Документ.pdf');
  assert.equal(messagePreview({ sticker_id: 's1' }), 'Стикер');
});

test('unread counters read cursors once and count conversations with bounded concurrency', async () => {
  const chats = Array.from({ length: 13 }, (_, index) => ({ id: `c${index}`, type: 'group', created_at: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00Z` }));
  let active = 0;
  let peak = 0;
  let readStateCalls = 0;
  const repository = {
    async getReadStates(ids, userId) {
      readStateCalls++;
      assert.equal(userId, 'me');
      assert.equal(ids.length, 13);
      return Ok([{ conversation_id: 'c0', last_read_at: '2026-01-01T00:00:00Z' }]);
    },
    async countUnreadMessages(id, userId, lastReadAt) {
      active++;
      peak = Math.max(peak, active);
      await wait(2);
      active--;
      assert.equal(userId, 'me');
      if (id === 'c0') assert.equal(lastReadAt, '2026-01-01T00:00:00Z');
      return Ok(Number(id.slice(1)));
    }
  };
  const controller = new ConversationStateController({
    repository, client: {}, getConversations: () => chats, getUser: () => ({ id: 'me' }),
    getActiveConversation: () => null, getMessages: () => [], renderList() {}, logger: { warn() {} }, maxConcurrentCounts: 4
  });
  await controller.refreshUnread();
  assert.equal(readStateCalls, 1);
  assert.equal(peak, 4);
  assert.deepEqual(chats.map(chat => chat._rimUnreadCount), Array.from({ length: 13 }, (_, index) => index));
});

test('unread refresh ignores stale completion after a newer refresh', async () => {
  const chats = [{ id: 'c1' }];
  let releaseFirst;
  let calls = 0;
  const repository = {
    async getReadStates() { return Ok([]); },
    async countUnreadMessages() {
      calls++;
      if (calls === 1) await new Promise(resolve => { releaseFirst = resolve; });
      return Ok(calls === 1 ? 99 : 2);
    }
  };
  const controller = new ConversationStateController({
    repository, client: {}, getConversations: () => chats, getUser: () => ({ id: 'me' }),
    getActiveConversation: () => null, getMessages: () => [], renderList() {}, logger: { warn() {} }
  });
  const first = controller.refreshUnread();
  await wait(0);
  await controller.refreshUnread();
  releaseFirst();
  await first;
  assert.equal(chats[0]._rimUnreadCount, 2);
});

test('mark read stores the latest loaded message timestamp, not the current wall clock', async () => {
  const writes = [];
  const controller = new ConversationStateController({
    repository: { async markRead(payload) { writes.push(payload); return Ok(true); } },
    client: {}, getConversations: () => [], getUser: () => ({ id: 'me' }),
    getActiveConversation: () => ({ id: 'c1' }),
    getMessages: () => [
      { id: 'm2', created_at: '2026-11-14T10:02:00Z' },
      { id: 'm1', created_at: '2026-11-14T10:01:00Z' }
    ], renderList() {}, logger: { warn() {} }
  });
  assert.equal(await controller.markActiveConversationRead(), true);
  assert.deepEqual(writes[0], {
    user_id: 'me', conversation_id: 'c1', last_read_message_id: 'm2', last_read_at: '2026-11-14T10:02:00Z'
  });
});

test('incoming message updates preview, activity order and unread count only for inactive chats', async () => {
  const chats = [{ id: 'a', created_at: '2026-01-01T00:00:00Z' }, { id: 'b', created_at: '2026-01-02T00:00:00Z' }];
  let renders = 0;
  const controller = new ConversationStateController({
    repository: {}, client: {}, getConversations: () => chats, getUser: () => ({ id: 'me' }),
    getActiveConversation: () => ({ id: 'a' }), getMessages: () => [], renderList() { renders++; }, logger: { warn() {} }
  });
  await controller.applyMessageEvent({ eventType: 'INSERT', new: { id: 'm1', conversation_id: 'a', sender_id: 'peer', body: 'В открытом чате', created_at: '2026-11-14T11:00:00Z' } });
  assert.equal(chats[0]._rimUnreadCount, undefined);
  assert.equal(chats[0]._rimLastMessagePreview, 'В открытом чате');
  assert.equal(chats[0]._rimLastMessageId, 'm1');
  assert.equal(chats[0].id, 'a');
  await controller.applyMessageEvent({ eventType: 'INSERT', new: { id: 'm2', conversation_id: 'b', sender_id: 'peer', body: 'Новое', created_at: '2026-11-14T12:00:00Z' } });
  assert.equal(chats[0].id, 'b');
  assert.equal(chats[0]._rimUnreadCount, 1);
  assert.equal(renders, 2);
});

test('repeated render passes do not write the same read cursor more than once', async () => {
  const writes = [];
  const controller = new ConversationStateController({
    repository: { async markRead(payload) { writes.push(payload); return Ok(true); } },
    client: {}, getConversations: () => [], getUser: () => ({ id: 'me' }),
    getActiveConversation: () => ({ id: 'c1' }),
    getMessages: () => [{ id: 'm1', created_at: '2026-11-14T11:00:00Z' }],
    renderList() {}, logger: { warn() {} }
  });
  await controller.markActiveConversationRead();
  await controller.markActiveConversationRead();
  assert.equal(writes.length, 1);
});
