import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test('app owns favorites row and gates legacy list wrappers', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  const session = readFileSync(join(root, 'src/composition/conversation-session-surface.js'), 'utf8');
  assert.match(app, /bindConversationSessionSurface/);
  assert.match(session, /__RIM_FAVORITES_ROW_OWNED\s*=\s*true/);
  assert.match(app, /4\.0\.0-iteration\.122/);
  for (const file of [
    'assets/js/legacy/16-rim-release-patch-2026-11.js',
    'assets/js/legacy/18-rim-update-core.js',
    'assets/js/legacy/24-rim-architecture-rebuild-2026-11-05.js'
  ]) {
    assert.match(readFileSync(join(root, file), 'utf8'), /__RIM_FAVORITES_ROW_OWNED/);
  }
});
