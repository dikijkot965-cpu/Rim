import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test('app owns nav compose and cabinet routes', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  const shell = readFileSync(join(root, 'src/composition/shell-surface.js'), 'utf8');
  assert.match(app, /bindShellSurface/);
  // class lives in composition modules: // moved to composition: assert.match(app, /NavigationPagesController/);
  // class lives in composition modules: // moved to composition: assert.match(app, /ComposeChatService/);
  // class lives in composition modules: // moved to composition: assert.match(app, /ImperialCabinetController/);
  assert.match(shell, /__RIM_NAV_PAGES_OWNED/);
  assert.match(shell, /__RIM_COMPOSE_CHAT_OWNED/);
  assert.match(shell, /__RIM_IMPERIAL_CABINET_OWNED/);
  assert.match(app, /4\.1\.8-iteration\.163/);
});
