import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test('app owns global search entrypoints', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  const shell = readFileSync(join(root, 'src/composition/shell-surface.js'), 'utf8');
  assert.match(app, /bindShellSurface/);
  // class lives in composition modules: // moved to composition: assert.match(app, /SearchController/);
  assert.match(shell, /__RIM_SEARCH_OWNED\s*=\s*true/);
  assert.match(shell, /rimSearch/);
  assert.match(app, /4\.1\.8-iteration\.163/);
});
