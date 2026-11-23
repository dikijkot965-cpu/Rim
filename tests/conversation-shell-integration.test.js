import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('app owns conversation shell after open', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  const session = readFileSync(join(root, 'src/composition/conversation-session-surface.js'), 'utf8');
  assert.match(app, /bindConversationSessionSurface/);
  assert.match(session, /ConversationShellController/);
  assert.match(session, /__RIM_CONVERSATION_SHELL_OWNED\s*=\s*true/);
  assert.match(app, /bindConversationOpenSurface/);
  const openSurface = readFileSync(join(root, 'src/composition/conversation-open-surface.js'), 'utf8');
  assert.match(openSurface, /applyAfterSelection/);
  assert.match(app, /4\.1\.8-iteration\.163/);
});

test('legacy group settings button is gated when shell is owned', () => {
  const legacy = readFileSync(join(root, 'assets/js/legacy/24-rim-architecture-rebuild-2026-11-05.js'), 'utf8');
  assert.match(legacy, /__RIM_CONVERSATION_SHELL_OWNED/);
});
