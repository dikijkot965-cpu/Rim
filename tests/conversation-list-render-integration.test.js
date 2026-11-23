import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test('app prefers modular conversation list paint', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  const session = readFileSync(join(root, 'src/composition/conversation-session-surface.js'), 'utf8');
  const entrypoints = readFileSync(join(root, 'src/composition/legacy-entrypoint-surface.js'), 'utf8');
  assert.match(app, /bindConversationSessionSurface/);
  assert.match(session, /__RIM_CONVERSATION_LIST_RENDER_OWNED\s*=\s*true/);
  assert.match(entrypoints, /conversationList\?\.paintList/);
  assert.match(app, /4\.1\.8-iteration\.163/);
});
