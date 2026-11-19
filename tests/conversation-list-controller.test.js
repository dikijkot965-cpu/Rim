import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationListController } from '../src/application/conversation-list-controller.js';

class FakeNode {
  constructor(className = '') {
    this.className = className;
    this.dataset = {};
    this.children = [];
    this.textContent = '';
    this.attributes = {};
    this.isConnected = true;
    this.style = {};
    this.innerHTML = '';
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  setAttribute(name, value) { this.attributes[name] = value; }
  querySelector(selector) { return this.children.find(child => child.selector === selector) || null; }
  replaceChildren(...children) { this.children = children; }
  append(child) { this.children.push(child); }
  remove() { this.removed = true; }
}

test('conversation list resolves peers in one batch and updates visible identity', async () => {
  const name1 = Object.assign(new FakeNode(), { selector: '.chat-item-name' });
  const preview1 = Object.assign(new FakeNode(), { selector: '.chat-item-preview' });
  const avatar1 = Object.assign(new FakeNode(), { selector: '.avatar' });
  const row1 = new FakeNode(); row1.children = [name1, preview1, avatar1]; row1.attributes.onclick = "openConversation('c1')";
  const name2 = Object.assign(new FakeNode(), { selector: '.chat-item-name' });
  const preview2 = Object.assign(new FakeNode(), { selector: '.chat-item-preview' });
  const avatar2 = Object.assign(new FakeNode(), { selector: '.avatar' });
  const row2 = new FakeNode(); row2.children = [name2, preview2, avatar2]; row2.dataset.conversationId = 'c2';
  const list = { querySelectorAll: () => [row1, row2] };
  const documentRef = {
    getElementById: id => id === 'chatList' ? list : null,
    createElement: tag => Object.assign(new FakeNode(), { tagName: tag })
  };
  const chats = [{ id: 'c1', type: 'direct' }, { id: 'c2', type: 'direct' }];
  let batchCalls = 0;
  const controller = new ConversationListController({
    repository: {
      async getDirectPeers(ids, userId) {
        batchCalls++;
        assert.deepEqual(ids, ['c1', 'c2']);
        assert.equal(userId, 'me');
        return { ok: true, value: {
          c1: { id: 'peer1', display_name: 'Анна', username: 'anna' },
          c2: { id: 'peer2', username: 'boris' }
        } };
      }
    },
    getConversations: () => chats,
    getUser: () => ({ id: 'me' }),
    avatarUrlFor: async () => null,
    logger: { warn() {} },
    documentRef
  });

  await controller.refresh();
  assert.equal(batchCalls, 1);
  assert.equal(name1.textContent, 'Анна');
  assert.equal(preview1.textContent, '@anna');
  assert.equal(avatar1.textContent, 'А');
  assert.equal(name2.textContent, 'boris');
  assert.equal(preview2.textContent, '@boris');
  assert.equal(avatar2.textContent, 'B');
});

test('conversation id parser prefers data attribute and supports legacy inline handler', () => {
  const controller = new ConversationListController({
    repository: {}, getConversations: () => [], getUser: () => null, avatarUrlFor: async () => null,
    documentRef: {}
  });
  const node = new FakeNode();
  node.attributes.onclick = "openConversation('legacy-id')";
  assert.equal(controller.conversationIdFromNode(node), 'legacy-id');
  assert.equal(node.dataset.conversationId, 'legacy-id');
  node.dataset.conversationId = 'data-id';
  assert.equal(controller.conversationIdFromNode(node), 'data-id');
});


test('conversation list displays the latest message preview supplied by the realtime projection', async () => {
  const name = Object.assign(new FakeNode(), { selector: '.chat-item-name' });
  const preview = Object.assign(new FakeNode(), { selector: '.chat-item-preview' });
  const row = new FakeNode(); row.children = [name, preview]; row.dataset.conversationId = 'c1';
  const list = { querySelectorAll: () => [row] };
  const controller = new ConversationListController({
    repository: {},
    getConversations: () => [{ id: 'c1', type: 'group', title: 'Экспедиционная группа', _rimLastMessagePreview: '  Новая   публикация   группы  ' }],
    getUser: () => ({ id: 'me' }),
    avatarUrlFor: async () => null,
    logger: { warn() {} },
    documentRef: { getElementById: () => list }
  });
  await controller.refresh();
  assert.equal(name.textContent, 'Экспедиционная группа');
  assert.equal(preview.textContent, 'Новая публикация группы');
});


test('conversation list renders unread badge using the existing feature-count class', async () => {
  const name = Object.assign(new FakeNode(), { selector: '.chat-item-name' });
  const row = new FakeNode(); row.children = [name]; row.dataset.conversationId = 'c1';
  const list = { querySelectorAll: () => [row] };
  const controller = new ConversationListController({
    repository: {}, getConversations: () => [{ id: 'c1', type: 'group', title: 'Группа', _rimUnreadCount: 124 }],
    getUser: () => ({ id: 'me' }), avatarUrlFor: async () => null, logger: { warn() {} },
    documentRef: { getElementById: () => list, createElement: () => new FakeNode() }
  });
  await controller.refresh();
  const badge = name.children.find(child => child.className === 'feature-count');
  assert.ok(badge);
  assert.equal(badge.textContent, '99+');
});
