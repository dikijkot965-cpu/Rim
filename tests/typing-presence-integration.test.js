import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = () => readFileSync(join(root, 'src/app.js'), 'utf8');
const runtime = () => readFileSync(join(root, 'src/composition/chat-runtime-surface.js'), 'utf8');
const openSurface = () => readFileSync(join(root, 'src/composition/conversation-open-surface.js'), 'utf8');

test('app owns typing presence after conversation open', () => {
  assert.match(app(), /bindChatRuntimeSurface/);
  assert.match(app(), /bindConversationOpenSurface/);
  assert.match(runtime(), /TypingPresenceController/);
  assert.match(runtime(), /__RIM_TYPING_PRESENCE_OWNED/);
  assert.match(openSurface(), /typingPresence/);
});
