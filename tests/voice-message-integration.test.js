import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = () => readFileSync(join(root, 'src/app.js'), 'utf8');
const runtime = () => readFileSync(join(root, 'src/composition/chat-runtime-surface.js'), 'utf8');

test('app owns voice recording when modular runtime is active', () => {
  assert.match(app(), /bindChatRuntimeSurface/);
  assert.match(runtime(), /VoiceMessageController/);
  assert.match(runtime(), /__RIM_VOICE_OWNED/);
});
