import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('composer chrome and viewport controllers exist', () => {
  const chrome = readFileSync(join(root, 'src/application/composer-chrome-controller.js'), 'utf8');
  const viewport = readFileSync(join(root, 'src/application/viewport-controller.js'), 'utf8');
  const shell = readFileSync(join(root, 'src/composition/shell-surface.js'), 'utf8');
  assert.match(chrome, /class ComposerChromeController/);
  assert.match(chrome, /__RIM_COMPOSER_CHROME_OWNED/);
  assert.match(viewport, /class ViewportController/);
  assert.match(viewport, /__RIM_VIEWPORT_OWNED/);
  assert.match(shell, /ComposerChromeController/);
  assert.match(shell, /ViewportController/);
});

test('bootstrap dual-binds composer and viewport', () => {
  const boot = readFileSync(join(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8');
  const shell = readFileSync(join(root, 'src/composition/shell-surface.js'), 'utf8');
  assert.match(shell, /composerChrome\.bindGlobals\(\)/);
  assert.match(shell, /viewport\.bindGlobals\(\)/);
  const lines = boot.split(/\n/).length;
  assert.ok(lines <= 350, `lines ${lines}`);
});
