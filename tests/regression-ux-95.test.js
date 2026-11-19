import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test('more/tools use section mode not only fullPage', () => {
  const nav = readFileSync(join(root, 'src/application/navigation-pages-controller.js'), 'utf8');
  assert.match(nav, /moreSection/);
  assert.match(nav, /toolsSection/);
  assert.match(nav, /#showOnly/);
});
test('chat focus hides topbar and stars hidden', () => {
  const css = readFileSync(join(root, 'assets/css/rim.css'), 'utf8');
  assert.match(css, /rim-chat-focus/);
  assert.match(css, /rim-save-message-btn\{display:none/);
});
test('chat info uses structured card', () => {
  const info = readFileSync(join(root, 'src/application/chat-info-controller.js'), 'utf8');
  assert.match(info, /rim-info-card/);
  assert.match(info, /rim-info-member/);
});
