import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationShellController } from '../src/application/conversation-shell-controller.js';

function createDocument() {
  const nodes = {
    chatHeadName: { textContent: '' },
    chatHeadStatus: { textContent: '' },
    chatHeadAvatar: { textContent: '', querySelector() { return null; }, innerHTML: '' },
    chatWindow: { classList: { add(...args) { this._added = args; }, _added: [] } },
    sidebar: { classList: { add(...args) { this._added = args; }, _added: [] } },
    rimGroupSettingsButton: null
  };
  const head = {
    append(node) { this._buttons.push(node); this._btn = node; },
    _btn: null,
    _buttons: []
  };
  return {
    getElementById(id) {
      if (id === 'rimGroupSettingsButton') return nodes.rimGroupSettingsButton;
      return nodes[id] || null;
    },
    querySelector(sel) {
      if (sel === '#chatWindow .chat-head') return head;
      return null;
    },
    createElement(tag) {
      return { id: '', type: '', className: '', title: '', textContent: '', addEventListener() {}, tag };
    },
    _nodes: nodes,
    _head: head
  };
}

test('shell paints provisional group header and settings button', () => {
  const documentRef = createDocument();
  const opens = [];
  const controller = new ConversationShellController({
    client: {},
    documentRef,
    windowRef: { rimOpenGroupSettings: id => opens.push(id), renderConversationList() {} }
  });
  controller.applyAfterSelection({ id: 'g1', type: 'group', title: 'Имперский штаб' });
  assert.equal(documentRef._nodes.chatHeadName.textContent, 'Имперский штаб');
  assert.equal(documentRef._nodes.chatHeadStatus.textContent, 'Групповая беседа');
  assert.equal(documentRef._nodes.chatHeadAvatar.textContent, '♧');
  const ids = documentRef._head._buttons.map(b => b.id);
  assert.ok(ids.includes('rimGroupSettingsButton'));
  assert.ok(ids.includes('pinnedShortcut'));
  assert.deepEqual(documentRef._nodes.chatWindow.classList._added, ['open', 'mobile-active']);
  controller.dispose();
});

test('shell uses direct defaults without group button', () => {
  const documentRef = createDocument();
  const controller = new ConversationShellController({
    client: {},
    documentRef,
    windowRef: { renderConversationList() {} }
  });
  controller.applyAfterSelection({ id: 'd1', type: 'direct' });
  assert.equal(documentRef._nodes.chatHeadName.textContent, 'Личная переписка');
  assert.equal(documentRef._nodes.chatHeadAvatar.textContent, '♙');
  const ids = documentRef._head._buttons.map(b => b.id);
  assert.ok(ids.includes('pinnedShortcut'));
  assert.ok(!ids.includes('rimGroupSettingsButton'));
  controller.dispose();
});

test('shell ensurePinnedShortcut is idempotent', () => {
  const documentRef = createDocument();
  const controller = new ConversationShellController({
    client: {},
    documentRef,
    windowRef: { openPinnedMessages() {}, renderConversationList() {} }
  });
  controller.ensurePinnedShortcut();
  assert.equal(documentRef._head._buttons.length, 1);
  // Simulate the button already present in the document tree.
  documentRef._nodes.pinnedShortcut = documentRef._head._buttons[0];
  controller.ensurePinnedShortcut();
  assert.equal(documentRef._head._buttons.length, 1);
  controller.dispose();
});
