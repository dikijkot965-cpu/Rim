import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareConversationsByActivity,
  messagePreview,
  displayConversationTitle,
  conversationSubtitle
} from '../src/domain/conversation.js';
import { compareConversations } from '../src/application/conversation-state-controller.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('domain and application share conversation ordering', () => {
  const a = { id: 'a', _rimLastMessageAt: '2026-01-01T00:00:00Z' };
  const b = { id: 'b', _rimLastMessageAt: '2026-06-01T00:00:00Z' };
  assert.equal(compareConversationsByActivity(a, b), compareConversations(a, b));
  assert.ok(compareConversations(a, b) > 0);
});

test('messagePreview prefers body then media', () => {
  assert.equal(messagePreview({ body: '  hello  ' }), 'hello');
  assert.equal(messagePreview({ image_path: 'x' }), 'Фото');
  assert.equal(messagePreview({ sticker_id: '⚜' }), 'Стикер');
});

test('titles and subtitles', () => {
  assert.equal(displayConversationTitle({ type: 'direct' }, { display_name: 'Кот' }), 'Кот');
  assert.equal(conversationSubtitle({ _rimLastMessagePreview: 'Привет' }), 'Привет');
});

test('bootstrap list paint is stubbed when modular owns', () => {
  const boot = readFileSync(join(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8');
  assert.match(boot, /function renderConversationList\(\)[^\n]*return null/);
  assert.doesNotMatch(boot, /Список чатов ещё загружается/);
});
