import test from 'node:test';
import assert from 'node:assert/strict';
import { createLegacyBridge } from '../src/compatibility/legacy-bridge.js';

test('legacy bridge exposes getMessages and setMessages from context', () => {
  let cache = [{ id: '1' }];
  const bridge = createLegacyBridge({
    db: { from() {} },
    getUser: () => ({ id: 'u1' }),
    getActiveConversation: () => ({ id: 'c1' }),
    getConversations: () => [],
    getMessages: () => cache,
    setMessages: rows => { cache = rows; },
    notify: () => {}
  });

  assert.equal(typeof bridge.getMessages, 'function');
  assert.equal(typeof bridge.setMessages, 'function');
  assert.deepEqual(bridge.getMessages(), [{ id: '1' }]);
  bridge.setMessages([{ id: '2' }]);
  assert.deepEqual(bridge.getMessages(), [{ id: '2' }]);
});

test('legacy bridge fails closed when setMessages is missing', () => {
  assert.throws(
    () => createLegacyBridge({
      db: {},
      getUser: () => null,
      getActiveConversation: () => null,
      getMessages: () => []
    }),
    /setMessages/
  );
});

test('legacy bridge exposes setConversations when provided by context', () => {
  let rows = [];
  const bridge = createLegacyBridge({
    db: { from() {} },
    getUser: () => ({ id: 'u1' }),
    getActiveConversation: () => null,
    getConversations: () => rows,
    setConversations: value => { rows = value; },
    getMessages: () => [],
    setMessages: () => {},
    notify: () => {}
  });
  bridge.setConversations([{ id: 'c1' }]);
  assert.deepEqual(bridge.getConversations(), [{ id: 'c1' }]);
});
