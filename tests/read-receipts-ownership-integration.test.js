import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = () => readFileSync(join(root, 'src/app.js'), 'utf8');
const runtime = () => readFileSync(join(root, 'src/composition/chat-runtime-surface.js'), 'utf8');

test('app claims read-receipt and own-presence ownership flags', () => {
  assert.match(app(), /bindChatRuntimeSurface/);
  assert.match(runtime(), /__RIM_READ_RECEIPTS_OWNED/);
  assert.match(runtime(), /__RIM_OWN_PRESENCE_OWNED/);
  assert.match(runtime(), /ReadReceiptController/);
  assert.match(runtime(), /OwnPresenceController/);
});
