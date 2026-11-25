import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('AppBootstrapController owns initializeApp', () => {
  const src = readFileSync(join(root, 'src/application/app-bootstrap-controller.js'), 'utf8');
  const shell = readFileSync(join(root, 'src/composition/shell-surface.js'), 'utf8');
  assert.match(src, /class AppBootstrapController/);
  assert.match(src, /__RIM_APP_BOOTSTRAP_OWNED/);
  assert.match(shell, /AppBootstrapController/);
});

test('bootstrap LOC under 620 after stub compaction', () => {
  const boot = readFileSync(join(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8');
  assert.match(boot, /async function initializeApp/);
  assert.match(shell, /appBootstrap\.bindGlobals\(\)/);
  const lines = boot.split(/\n/).length;
  assert.ok(lines <= 350, `lines ${lines}`);
});
