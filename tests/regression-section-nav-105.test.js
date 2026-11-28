import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('NavigationSectionController owns primary tabs', () => {
  const src = readFileSync(join(root, 'src/application/navigation-section-controller.js'), 'utf8');
  const shell = readFileSync(join(root, 'src/composition/shell-surface.js'), 'utf8');
  assert.match(src, /class NavigationSectionController/);
  assert.match(src, /__RIM_SECTION_NAV_OWNED/);
  assert.match(shell, /new NavigationSectionController/);
});

test('bootstrap conversation open/load/send are stubs', () => {
  const boot = readFileSync(join(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8');
  assert.match(boot, /async function loadConversations\(\)[^\n]*return null/);
  assert.doesNotMatch(boot, /Модуль списка чатов ещё загружается/);
  assert.match(boot, /Модуль открытия чата ещё загружается/);
  assert.match(boot, /__RIM_SECTION_NAV_OWNED/);
  const lines = boot.split(/\n/).length;
  assert.ok(lines < 880, `lines ${lines}`);
});


test('feed tab is explicitly shown and refreshes remote posts and topics', () => {
  const src = readFileSync(join(root, 'src/application/navigation-section-controller.js'), 'utf8');
  assert.match(src, /feed/);
  assert.match(src, /renderFeedList/);
  assert.match(src, /rimLoadFeedTopics/);
});
