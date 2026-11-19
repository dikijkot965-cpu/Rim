import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test('shell page controller provides fullPage for More/Tools', () => {
  const page = readFileSync(join(root, 'src/application/shell-page-controller.js'), 'utf8');
  const shell = readFileSync(join(root, 'src/composition/shell-surface.js'), 'utf8');
  assert.match(page, /fullPage\(/);
  assert.match(page, /rimClosePage|closePage/);
  assert.match(shell, /ShellPageController/);
  assert.match(shell, /shellPage\.bindGlobals/);
});
test('favorites row uses chat-item structure', () => {
  const list = readFileSync(join(root, 'src/application/conversation-list-controller.js'), 'utf8');
  assert.match(list, /chat-item-name">Избранное/);
  assert.match(list, /chat-item-preview">Личные заметки/);
});
