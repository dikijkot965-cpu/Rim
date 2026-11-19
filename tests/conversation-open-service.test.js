import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationOpenService } from '../src/application/conversation-open-service.js';

test('modular open resolves, commits, loads and subscribes', async () => {
  const calls = [];
  const chat = { id: 'c1', type: 'direct', title: 'Пилот' };
  const token = { sequence: 1, conversationId: 'c1' };
  const service = new ConversationOpenService({
    getUser: () => ({ id: 'u1' }),
    getConversations: () => [chat],
    beginNavigation: id => { calls.push(`begin:${id}`); return token; },
    isNavigationCurrent: () => true,
    commitSelection: (t, c) => { calls.push(`commit:${c.id}`); return true; },
    shell: {
      paintProvisionalHeader: c => calls.push(`header:${c.id}`),
      openMobileShell: () => calls.push('mobile'),
      applyAfterSelection: c => calls.push(`after:${c.id}`)
    },
    loadMessages: async () => { calls.push('load'); },
    subscribeMessages: () => calls.push('sub'),
    markRead: async () => calls.push('read'),
    cancelReply: () => calls.push('cancelReply'),
    documentRef: {
      getElementById: id => (id === 'chatWindow' ? { classList: { add() {} } } : null)
    },
    notify: () => {}
  });
  const result = await service.open('c1');
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['begin:c1', 'cancelReply', 'commit:c1', 'header:c1', 'mobile', 'load', 'sub', 'read', 'after:c1']);
});

test('modular open fails closed without user or host', async () => {
  const notes = [];
  const service = new ConversationOpenService({
    getUser: () => null,
    documentRef: { getElementById: () => null },
    notify: m => notes.push(m)
  });
  const result = await service.open('c1');
  assert.equal(result.ok, false);
  assert.ok(notes[0]);
});

test('modular open resolves missing chat via repository', async () => {
  const calls = [];
  const chat = { id: 'c9', type: 'group', title: 'Штаб' };
  const token = { sequence: 2, conversationId: 'c9' };
  const service = new ConversationOpenService({
    getUser: () => ({ id: 'u1' }),
    getConversations: () => [],
    setConversations: list => calls.push(`set:${list[0].id}`),
    resolveConversation: async (id) => { calls.push(`resolve:${id}`); return chat; },
    beginNavigation: () => token,
    isNavigationCurrent: () => true,
    commitSelection: () => true,
    shell: {
      paintProvisionalHeader: () => {},
      openMobileShell: () => {},
      applyAfterSelection: () => {}
    },
    loadMessages: async () => {},
    subscribeMessages: () => {},
    documentRef: { getElementById: () => ({ classList: { add() {} } }) },
    notify: () => {}
  });
  const result = await service.open('c9');
  assert.equal(result.ok, true);
  assert.ok(calls.includes('resolve:c9'));
  assert.ok(calls.includes('set:c9'));
});
