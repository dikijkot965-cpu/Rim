import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = () => readFileSync(join(root, 'src/app.js'), 'utf8');
const runtime = () => readFileSync(join(root, 'src/composition/chat-runtime-surface.js'), 'utf8');
const entrypoints = () => readFileSync(join(root, 'src/composition/legacy-entrypoint-surface.js'), 'utf8');

test('app prefers modular message list renderer', () => {
  assert.match(app(), /bindChatRuntimeSurface/);
  assert.match(app(), /bindLegacyEntrypointSurface/);
  assert.match(runtime(), /MessageListRenderer/);
  assert.match(runtime(), /__RIM_MESSAGE_LIST_RENDERER_OWNED/);
  assert.match(entrypoints(), /messageListRenderer/);
});
