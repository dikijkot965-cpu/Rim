import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageDecorationsController } from '../src/application/message-decorations-controller.js';

test('decorate adds pin and advanced action buttons once', async () => {
  const appended = [];
  const actions = {
    querySelector(sel) {
      return appended.find(node => {
        if (sel === '[data-rim-advanced]') return node.dataset?.rimAdvanced === '1';
        if (sel === '[data-pin-action]') return node.dataset?.pinAction === '1';
        if (sel === '[data-rim-report]') return node.dataset?.rimReport === '1';
        return false;
      }) || null;
    },
    append(node) { appended.push(node); }
  };
  const message = {
    dataset: { id: 'm1' },
    classList: { contains() { return true; } },
    querySelector(sel) { return sel === '.message-actions' ? actions : null; }
  };
  const box = {
    querySelectorAll(sel) { return sel === '.message[data-id]' ? [message] : []; },
    querySelector() { return null; }
  };
  const documentRef = {
    getElementById(id) { return id === 'messages' ? box : null; },
    createElement(tag) {
      return { type: '', dataset: {}, title: '', textContent: '', addEventListener() {}, className: '', innerHTML: '' };
    }
  };
  const controller = new MessageDecorationsController({
    client: { storage: { from() { return { createSignedUrl: async () => ({ data: null, error: null }) }; } } },
    getUser: () => ({ id: 'u1' }),
    getMessages: () => [],
    documentRef,
    windowRef: {}
  });
  await controller.decorate(box);
  assert.ok(appended.some(node => node.dataset.pinAction === '1'));
  assert.ok(appended.some(node => node.dataset.rimAdvanced === '1'));
  const count = appended.length;
  await controller.decorate(box);
  assert.equal(appended.length, count);
  controller.dispose();
});

test('decorate paints forward label for hidden sender', async () => {
  const messageEl = {
    dataset: { id: 'm2' },
    classList: { contains() { return false; } },
    firstChild: null,
    querySelector(sel) {
      if (sel === '.message-actions') return {
        querySelector() { return {}; },
        append() {}
      };
      if (sel === '.rim-forward-source') return this._forward || null;
      return null;
    },
    insertBefore(node) { this._forward = node; }
  };
  const box = {
    querySelectorAll() { return [messageEl]; },
    querySelector(sel) {
      if (sel.includes('m2')) return messageEl;
      return null;
    }
  };
  const documentRef = {
    getElementById() { return box; },
    createElement() { return { className: '', textContent: '' }; }
  };
  const controller = new MessageDecorationsController({
    client: { storage: { from() { return { createSignedUrl: async () => ({ data: null }) }; } } },
    getUser: () => ({ id: 'u1' }),
    getMessages: () => [{ id: 'm2', forwarded_from_message_id: 'x', forwarded_hide_sender: true }],
    documentRef,
    windowRef: {}
  });
  await controller.decorate(box);
  assert.equal(messageEl._forward.textContent, 'Пересланное сообщение');
  controller.dispose();
});
