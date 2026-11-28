import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../assets/js/rim-runtime-bootstrap.js', import.meta.url), 'utf8');

test('chat bootstrap placeholders do not show false loading notifications', () => {
  assert.match(source, /async function loadConversations\(\)[^\n]*return null/);
  assert.match(source, /function renderConversationList\(\)[^\n]*return null/);
  assert.doesNotMatch(source, /Модуль списка чатов ещё загружается|Список чатов ещё загружается/);
});
