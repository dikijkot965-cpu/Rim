import test from 'node:test';
import assert from 'node:assert/strict';
import { ReplyTargetController } from '../src/application/reply-target-controller.js';

test('setReply updates target and reply bar', () => {
  const targets = [];
  const replyText = { textContent: '' };
  const replyBar = { classList: { remove(name) { this._removed = name; }, add(name) { this._added = name; } } };
  const input = { focusCalls: 0, focus() { this.focusCalls += 1; } };
  const documentRef = {
    getElementById(id) {
      if (id === 'replyText') return replyText;
      if (id === 'replyBar') return replyBar;
      if (id === 'messageInput') return input;
      return null;
    }
  };
  const controller = new ReplyTargetController({
    getMessages: () => [{ id: 'm1', body: 'Здравствуй, Царьград' }],
    setReplyTarget: value => targets.push(value),
    documentRef
  });
  assert.equal(controller.setReply('m1'), true);
  assert.equal(targets[0].id, 'm1');
  assert.match(replyText.textContent, /Здравствуй/);
  assert.equal(replyBar.classList._removed, 'hidden');
  assert.equal(input.focusCalls, 1);
  controller.cancel();
  assert.equal(targets[1], null);
  controller.dispose();
});
