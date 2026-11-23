import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test('app owns block list routes', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  const surface = readFileSync(join(root, 'src/composition/settings-surface.js'), 'utf8');
  assert.match(app, /bindSettingsSurface/);
  // class lives in composition modules: // moved to composition: assert.match(app, /BlockListService/);
  assert.match(surface, /BlockListService/);
  assert.match(surface, /__RIM_BLOCK_LIST_OWNED\s*=\s*true/);
  assert.match(surface, /rimOpenBlocks/);
  assert.match(app, /4\.1\.8-iteration\.163/);
});
