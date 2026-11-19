import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationListController } from '../src/application/conversation-list-controller.js';

test('paintList inserts a single favorites row among chats', () => {
  const children = [];
  const list = {
    innerHTML: '',
    dataset: {},
    contains() { return true; },
    addEventListener() {},
    querySelectorAll(sel) {
      if (String(sel).includes('rimFavorites')) return children.filter(c => c.id === 'rimFavoritesRow');
      if (String(sel).includes('data-conversation-id')) return children.filter(c => c.getAttribute?.('data-conversation-id'));
      return [];
    },
    prepend(node) { children.unshift(node); },
    appendChild(node) { children.push(node); return node; },
    insertBefore(node, ref) {
      const idx = children.indexOf(ref);
      if (idx >= 0) children.splice(idx, 0, node);
      else children.push(node);
      return node;
    }
  };
  const documentRef = {
    getElementById(id) { return id === 'chatList' ? list : null; },
    createElement(tag) {
      const el = {
        type: '', id: '', className: '', style: { width: '', textAlign: '' },
        innerHTML: '', dataset: {}, attrs: {},
        addEventListener() {}, remove() {
          const idx = children.indexOf(this);
          if (idx >= 0) children.splice(idx, 1);
        },
        setAttribute(k,v){ this.attrs[k]=v; },
        getAttribute(k){ return this.attrs[k]; },
        tagName: tag
      };
      return el;
    }
  };
  const controller = new ConversationListController({
    repository: {},
    getConversations: () => [{ id: 'c1', type: 'direct', _rimLastMessageAt: '2026-01-01T00:00:00Z' }],
    getUser: () => ({ id: 'u1' }),
    getActiveConversation: () => null,
    avatarUrlFor: async () => null,
    documentRef,
    windowRef: { openFavorites() {}, localStorage: { getItem: () => null, setItem() {} } }
  });
  // seed a chat node so placement logic runs
  const chatNode = documentRef.createElement('div');
  chatNode.className = 'chat-item';
  chatNode.setAttribute('data-conversation-id', 'c1');
  children.push(chatNode);
  controller.ensureFavoritesRow();
  assert.equal(children.filter(c => c.id === 'rimFavoritesRow').length, 1);
});
