import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationNavigationController } from '../src/application/conversation-navigation-controller.js';

test('commits active conversation and clears reply target through injected state ports', () => {
  let active = null;
  let reply = { id: 'reply-1' };
  const committed = [];
  const controller = new ConversationNavigationController({
    getActiveConversation: () => active,
    setActiveConversation: value => { active = value; },
    setReplyTarget: value => { reply = value; },
    onCommit: value => committed.push(value.id)
  });
  const token = controller.begin('c1');
  assert.equal(controller.commit(token, { id: 'c1', type: 'group' }), true);
  assert.deepEqual(active, { id: 'c1', type: 'group' });
  assert.equal(reply, null);
  assert.deepEqual(committed, ['c1']);
});

test('a stale navigation token cannot overwrite a newer active conversation', () => {
  let active = null;
  const controller = new ConversationNavigationController({ setActiveConversation: value => { active = value; } });
  const first = controller.begin('c1');
  const second = controller.begin('c2');
  assert.equal(controller.commit(first, { id: 'c1' }), false);
  assert.equal(controller.commit(second, { id: 'c2' }), true);
  assert.equal(active.id, 'c2');
});

test('rejects a conversation that does not match the navigation token', () => {
  let active = null;
  const warnings = [];
  const controller = new ConversationNavigationController({
    setActiveConversation: value => { active = value; },
    logger: { warn: (...args) => warnings.push(args) }
  });
  const token = controller.begin('expected');
  assert.equal(controller.commit(token, { id: 'different' }), false);
  assert.equal(active, null);
  assert.equal(warnings.length, 1);
});

test('invalidate and dispose prevent pending navigation commits', () => {
  let active = null;
  const controller = new ConversationNavigationController({ setActiveConversation: value => { active = value; } });
  const token = controller.begin('c1');
  controller.invalidate();
  assert.equal(controller.commit(token, { id: 'c1' }), false);
  const second = controller.begin('c2');
  controller.dispose();
  assert.equal(controller.commit(second, { id: 'c2' }), false);
  assert.equal(active, null);
  assert.equal(controller.begin('c3'), null);
});
