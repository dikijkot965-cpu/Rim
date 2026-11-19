import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PinnedMessagesController } from '../src/application/pinned-messages-controller.js';

function makeClient(pins = [], error = null) {
  return {
    from(table) {
      assert.equal(table, 'message_pins');
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    order() {
                      return Promise.resolve({ data: pins, error });
                    }
                  };
                }
              };
            }
          };
        }
      };
    }
  };
}

test('open rejects without active conversation', async () => {
  const ctrl = new PinnedMessagesController({
    client: makeClient(),
    getUser: () => ({ id: 'u1' }),
    getActiveConversation: () => null,
    showModal: () => {}
  });
  const result = await ctrl.open();
  assert.equal(result.ok, false);
});

test('open rejects without user', async () => {
  const ctrl = new PinnedMessagesController({
    client: makeClient(),
    getUser: () => null,
    getActiveConversation: () => ({ id: 'c1' }),
    showModal: () => {}
  });
  const result = await ctrl.open();
  assert.equal(result.ok, false);
});

test('open renders empty state', async () => {
  let modalHtml = '';
  const ctrl = new PinnedMessagesController({
    client: makeClient([]),
    getUser: () => ({ id: 'u1' }),
    getActiveConversation: () => ({ id: 'c1' }),
    showModal: html => { modalHtml = html; }
  });
  const result = await ctrl.open();
  assert.equal(result.ok, true);
  assert.equal(result.value.count, 0);
  assert.match(modalHtml, /Нет закреплённых сообщений/);
  assert.match(modalHtml, /📌 Закреплённые сообщения/);
});

test('open renders pinned bodies and actions', async () => {
  let modalHtml = '';
  const pins = [
    {
      message_id: 'm1',
      created_at: '2026-01-01',
      chat_messages: { id: 'm1', body: 'Важное', sticker_id: null }
    },
    {
      message_id: 'm2',
      created_at: '2026-01-02',
      chat_messages: { id: 'm2', body: null, sticker_id: 'sticker_42' }
    }
  ];
  const ctrl = new PinnedMessagesController({
    client: makeClient(pins),
    getUser: () => ({ id: 'u1' }),
    getActiveConversation: () => ({ id: 'c1' }),
    showModal: html => { modalHtml = html; }
  });
  const result = await ctrl.open();
  assert.equal(result.ok, true);
  assert.equal(result.value.count, 2);
  assert.match(modalHtml, /Важное/);
  assert.match(modalHtml, /sticker_42/);
  assert.match(modalHtml, /jumpToMessage\('m1'\)/);
  assert.match(modalHtml, /unpinMessage\('m1'\)/);
});

test('open surfaces load error via featureError', async () => {
  let called = null;
  const ctrl = new PinnedMessagesController({
    client: makeClient([], new Error('db down')),
    getUser: () => ({ id: 'u1' }),
    getActiveConversation: () => ({ id: 'c1' }),
    featureError: (msg, err) => { called = { msg, err }; },
    showModal: () => {}
  });
  const result = await ctrl.open();
  assert.equal(result.ok, false);
  assert.equal(called?.msg, 'Не удалось загрузить закреплённое');
});
