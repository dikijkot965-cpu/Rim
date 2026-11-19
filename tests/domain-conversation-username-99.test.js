import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sortConversationsByActivity,
  filterConversations,
  isDirectConversation,
  displayConversationTitle
} from '../src/domain/conversation.js';
import { validateUsername, normalizeUsername } from '../src/domain/username.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('sortConversationsByActivity orders by last activity', () => {
  const sorted = sortConversationsByActivity([
    { id: '1', title: 'B', last_message_at: '2026-01-01T00:00:00Z' },
    { id: '2', title: 'A', last_message_at: '2026-06-01T00:00:00Z' }
  ]);
  assert.equal(sorted[0].id, '2');
});

test('filterConversations matches title', () => {
  const rows = filterConversations([
    { id: '1', title: 'Совет Директоров' },
    { id: '2', title: 'Избранное' }
  ], 'совет');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, '1');
});

test('displayConversationTitle for direct uses peer', () => {
  assert.equal(
    displayConversationTitle({ type: 'direct', title: '' }, { display_name: 'Кот' }),
    'Кот'
  );
  assert.equal(isDirectConversation({ type: 'direct' }), true);
});

test('username validation', () => {
  assert.equal(normalizeUsername('@Imperator'), 'imperator');
  assert.equal(validateUsername('ab').ok, false);
  assert.equal(validateUsername('good_user').ok, true);
});

test('bootstrap messaging fallbacks are stubs', () => {
  const boot = readFileSync(join(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8');
  assert.match(boot, /Модуль ленты сообщений ещё загружается/);
  assert.doesNotMatch(boot, /from\('chat_messages'\)\.select\('\*'\)/);
});
