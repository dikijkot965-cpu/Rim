import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test('showSection hides more and tools sections', () => {
  const boot = readFileSync(join(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8');
  assert.match(boot, /moreSection/);
  assert.match(boot, /toolsSection/);
  assert.match(boot, /function showSection/);
});
test('tab order is more then tools', () => {
  const tab = readFileSync(join(root, 'src/application/tabbar-controller.js'), 'utf8');
  assert.match(tab, /tabMoreFull\{order:4/);
  assert.match(tab, /tabToolsFull\{order:5/);
});
test('lite writer header ordered', () => {
  const w = readFileSync(join(root, 'src/features/lite-writer.js'), 'utf8');
  const iTitle = w.indexOf('<div class="grow"><h2>Lite Writer</h2></div>');
  const iDocs = w.indexOf('data-docs');
  const iSave = w.indexOf('data-save');
  assert.ok(iTitle > 0 && iDocs > iTitle && iSave > iDocs);
});
