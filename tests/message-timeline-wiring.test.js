import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test('message timeline surface passes getConversation to controller', () => {
  const surface = readFileSync(join(root, 'src/composition/message-timeline-surface.js'), 'utf8');
  assert.match(surface, /getConversation:\s*getActiveConversation/);
});
