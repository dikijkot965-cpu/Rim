import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test('shell binds TabbarController and sets ownership flag', () => {
  const shell = readFileSync(join(root, 'src/composition/shell-surface.js'), 'utf8');
  assert.match(shell, /TabbarController/);
  assert.match(shell, /__RIM_TABBAR_OWNED/);
  assert.match(shell, /tabbar\.start\(\)/);
});
test('index.html no longer loads legacy 10 18 24', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /script src="assets\/js\/legacy\/10-legacy-10\.js"/);
  assert.doesNotMatch(html, /script src="assets\/js\/legacy\/18-rim-update-core\.js"/);
  assert.doesNotMatch(html, /script src="assets\/js\/legacy\/24-rim-architecture-rebuild/);
  assert.match(html, /rim-runtime-bootstrap\.js/);
});
