import test from 'node:test';
import assert from 'node:assert/strict';
import { ReadReceiptController, latestPeerReadTimestamp, isMessageRead, isOwnMessage } from '../src/application/read-receipt-controller.js';

test('peer read cursor selects the newest valid timestamp and ignores malformed values', () => {
  assert.equal(latestPeerReadTimestamp([
    { last_read_at: '2026-11-14T10:00:00Z' },
    { last_read_at: 'invalid' },
    { last_read_at: '2026-11-14T11:00:00Z' },
    { last_read_at: null }
  ]), Date.parse('2026-11-14T11:00:00Z'));
  assert.equal(latestPeerReadTimestamp([]), null);
});

test('only messages authored by the current user receive outgoing ticks', () => {
  assert.equal(isOwnMessage({ sender_id: 'me' }, 'me'), true);
  assert.equal(isOwnMessage({ sender_id: 'peer' }, 'me'), false);
  assert.equal(isOwnMessage({ sender_id: null }, 'me'), false);
});

test('only own messages at or before peer cursor are considered read', () => {
  const cursor = Date.parse('2026-11-14T10:02:00Z');
  assert.equal(isMessageRead({ created_at: '2026-11-14T10:01:00Z' }, cursor), true);
  assert.equal(isMessageRead({ created_at: '2026-11-14T10:03:00Z' }, cursor), false);
  assert.equal(isMessageRead({ created_at: 'invalid' }, cursor), false);
  assert.equal(isMessageRead({ created_at: '2026-11-14T10:01:00Z' }, cursor, false), false);
});

test('read cursor query excludes the current user and is scoped to the active conversation', async () => {
  const calls = [];
  const client = { from(table) {
    assert.equal(table, 'conversation_read_state');
    const query = {
      select(value) { calls.push(['select', value]); return query; },
      eq(key, value) { calls.push(['eq', key, value]); return query; },
      neq(key, value) { calls.push(['neq', key, value]); return query; },
      then(resolve) { resolve({ data: [{ last_read_at: '2026-11-14T10:00:00Z' }], error: null }); }
    };
    return query;
  }};
  const controller = new ReadReceiptController({
    client, getUser: () => ({ id: 'me' }), getActiveConversation: () => ({ id: 'chat-7' }),
    getMessages: () => [], getPreferences: () => ({ showRead: true })
  });
  const value = await controller.getPeerReadAt('chat-7');
  assert.equal(value, Date.parse('2026-11-14T10:00:00Z'));
  assert.deepEqual(calls, [
    ['select', 'last_read_at'], ['eq', 'conversation_id', 'chat-7'], ['neq', 'user_id', 'me']
  ]);
});

test('disabled read receipts do not subscribe or query peer state', async () => {
  let channels = 0;
  let queries = 0;
  const controller = new ReadReceiptController({
    client: {
      channel() { channels++; throw new Error('must not subscribe'); },
      from() { queries++; throw new Error('must not query'); }
    },
    getUser: () => ({ id: 'me' }), getActiveConversation: () => ({ id: 'c1' }),
    getMessages: () => [], getPreferences: () => ({ showRead: false })
  });
  await controller.bind('c1');
  await controller.render();
  assert.equal(channels, 0);
  assert.equal(queries, 0);
});

test('switching active conversations invalidates stale read-state callbacks', async () => {
  let callback;
  let removed = 0;
  const client = {
    channel() {
      return {
        on(_event, _filter, handler) { callback = handler; return this; },
        subscribe() { return this; }
      };
    },
    async removeChannel() { removed++; }
  };
  let active = { id: 'first' };
  const controller = new ReadReceiptController({
    client, getUser: () => ({ id: 'me' }), getActiveConversation: () => active,
    getMessages: () => [], getPreferences: () => ({ showRead: true })
  });
  await controller.bind('first');
  const stale = callback;
  active = { id: 'second' };
  await controller.bind('second');
  await stale();
  assert.equal(controller.conversationId, 'second');
  assert.equal(removed, 1);
  await controller.dispose();
  assert.equal(removed, 2);
});

test('Realtime read-state subscription is scoped and removed when disposed', async () => {
  const subscriptions = [];
  let removed = 0;
  const client = {
    channel(name) {
      const entry = { name, filter: null, handler: null };
      subscriptions.push(entry);
      return {
        on(_event, filter, handler) { entry.filter = filter; entry.handler = handler; return this; },
        subscribe() { return this; }
      };
    },
    async removeChannel() { removed++; }
  };
  const controller = new ReadReceiptController({
    client, getUser: () => ({ id: 'me' }), getActiveConversation: () => ({ id: 'c2' }),
    getMessages: () => [], getPreferences: () => ({ showRead: true })
  });
  await controller.bind('c2');
  assert.equal(subscriptions[0].name, 'rim-read-receipts-c2');
  assert.deepEqual(subscriptions[0].filter, {
    event: '*', schema: 'public', table: 'conversation_read_state', filter: 'conversation_id=eq.c2'
  });
  await controller.dispose();
  assert.equal(removed, 1);
});
