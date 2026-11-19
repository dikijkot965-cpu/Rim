import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationListController } from '../src/application/conversation-list-controller.js';

test('paintList renders chat items with data-conversation-id', () => {
  const list = {
    innerHTML: '',
    dataset: {},
    contains() { return true; },
    addEventListener() {},
    querySelectorAll() { return []; },
    prepend() {},
    appendChild() {},
    insertBefore() {}
  };
  const documentRef = {
    getElementById(id) { return id === 'chatList' ? list : null; },
    createElement(tag) {
      return {
        type: '', id: '', className: '', style: { width: '', textAlign: '' },
        innerHTML: '', dataset: {}, addEventListener() {}, remove() {},
        setAttribute() {}, getAttribute() { return null; }, tagName: tag
      };
    }
  };
  const controller = new ConversationListController({
    repository: {},
    getConversations: () => [
      { id: 'c1', type: 'direct', title: null },
      { id: 'c2', type: 'group', title: 'Штаб' }
    ],
    getUser: () => ({ id: 'u1' }),
    getActiveConversation: () => ({ id: 'c2' }),
    avatarUrlFor: async () => null,
    logger: null,
    documentRef,
    windowRef: { openConversation() {}, localStorage: { getItem: () => null, setItem() {} } }
  });
  controller.paintList();
  assert.match(list.innerHTML, /data-conversation-id="c1"/);
  assert.match(list.innerHTML, /data-conversation-id="c2"/);
  assert.match(list.innerHTML, /chat-item active/);
  assert.match(list.innerHTML, /Штаб/);
  assert.doesNotMatch(list.innerHTML, /onclick=/);
});
