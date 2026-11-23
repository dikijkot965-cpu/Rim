import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('app claims chat-info and pinned-messages ownership through chat-audience composition', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  assert.match(app, /bindChatAudience/);
  // class lives in composition modules: // moved to composition: assert.match(app, /ChatInfoController/);
  // class lives in composition modules: // moved to composition: assert.match(app, /PinnedMessagesController/);
  assert.match(app, /4\.1\.8-iteration\.163/);

  const composition = readFileSync(join(root, 'src/composition/chat-audience.js'), 'utf8');
  assert.match(composition, /__RIM_CHAT_INFO_OWNED/);
  assert.match(composition, /__RIM_PINNED_MESSAGES_OWNED/);
  assert.match(composition, /openChatInfo/);
  assert.match(composition, /openPinnedMessages/);
  const legacy03 = readFileSync(join(root, 'assets/js/legacy/03-legacy-03.js'), 'utf8');
  assert.match(legacy03, /__RIM_CHAT_INFO_OWNED/);

  const restore = readFileSync(join(root, 'assets/js/legacy/12-rim-restore-layer-2026-11.js'), 'utf8');
  assert.match(restore, /__RIM_CHAT_INFO_OWNED/);
});
