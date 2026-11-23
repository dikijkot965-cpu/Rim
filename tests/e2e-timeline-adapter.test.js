import test from 'node:test';
import assert from 'node:assert/strict';
import { toRimE2ETimelineMessage, mergeRimE2ETimelineMessages } from '../src/security/e2e/e2e-timeline-adapter.js';
import { MessageTimelineController } from '../src/application/message-timeline-controller.js';

test('E2E local records map to the RIM timeline without losing local-only markers', () => {
  const row = toRimE2ETimelineMessage({
    messageId: 'e2e-1', conversationId: 'direct-1', body: 'secret',
    senderId: 'user-a', timestamp: 1700000000000, direction: 'outgoing'
  }, 'user-a');
  assert.equal(row.id, 'e2e-1');
  assert.equal(row.conversation_id, 'direct-1');
  assert.equal(row.sender_id, 'user-a');
  assert.equal(row._rimE2E, true);
  assert.equal(row._rimLocalOnly, true);
  assert.equal(row._rimEncrypted, true);
  assert.equal(row._rimE2EDirection, 'outgoing');
  assert.equal(row.created_at, new Date(1700000000000).toISOString());
});

test('E2E merge sorts mixed history and deduplicates by stable message ID', () => {
  const merged = mergeRimE2ETimelineMessages([
    { id: 'plain-2', created_at: '2024-01-02T00:00:00.000Z', body: 'normal' },
    { id: 'duplicate', created_at: '2024-01-03T00:00:00.000Z', body: 'server placeholder' }
  ], [
    { messageId: 'e2e-1', conversationId: 'd1', body: 'older secret', senderId: 'a', timestamp: 1704067200000 },
    { messageId: 'duplicate', conversationId: 'd1', body: 'decrypted', senderId: 'a', timestamp: 1704240000000 }
  ], 'a');
  assert.deepEqual(merged.map(row => row.id), ['e2e-1', 'plain-2', 'duplicate']);
  assert.equal(merged[2].body, 'decrypted');
  assert.equal(merged[2]._rimLocalOnly, true);
});

test('timeline loads local E2E history only for protected direct chats and private groups', async () => {
  let conversation = { id: 'd1', type: 'direct', is_secret: true };
  let messages = [];
  let localCalls = 0;
  const controller = new MessageTimelineController({
    repository: { getLatest: async () => ({ ok: true, value: [{ id: 'plain-1', created_at: '2024-01-02T00:00:00.000Z', body: 'normal' }] }) },
    getConversation: () => conversation,
    getMessages: () => messages,
    setMessages: rows => { messages = rows; },
    render: async () => {},
    loadLocalMessages: async () => { localCalls++; return [{ messageId: 'e2e-1', conversationId: 'd1', body: 'secret', senderId: 'a', timestamp: 1704067200000 }]; },
    getUser: () => ({ id: 'a' })
  });
  await controller.loadLatest();
  assert.deepEqual(messages.map(row => row.id), ['e2e-1', 'plain-1']);
  assert.equal(localCalls, 1);
  conversation = { id: 'g1', type: 'group', is_private: true, e2e_mode: 'required' };
  await controller.loadLatest();
  assert.equal(localCalls, 2);
  assert.equal(messages.some(row => row._rimLocalOnly), true);
  conversation = { id: 'g2', type: 'group', is_private: false, e2e_mode: 'required' };
  await controller.loadLatest();
  assert.equal(localCalls, 2);
  assert.equal(messages.some(row => row._rimLocalOnly), false);
});

test('timeline local-history failure preserves server history', async () => {
  let messages = [];
  const controller = new MessageTimelineController({
    repository: { getLatest: async () => ({ ok: true, value: [{ id: 'plain-1', created_at: '2024-01-02T00:00:00.000Z' }] }) },
    getConversation: () => ({ id: 'd1', type: 'direct' }), getMessages: () => messages,
    setMessages: rows => { messages = rows; }, render: async () => {},
    loadLocalMessages: async () => { throw new Error('IndexedDB unavailable'); },
    logger: { warn() {} }
  });
  await controller.loadLatest();
  assert.deepEqual(messages.map(row => row.id), ['plain-1']);
});
