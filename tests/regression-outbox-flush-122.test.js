import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('sendText supports fromOutbox without active-conversation lock', () => {
  const src = readFileSync(join(root, 'src/application/message-command-service.js'), 'utf8');
  assert.match(src, /fromOutbox/);
  assert.match(src, /send-outbox:/);
  assert.match(src, /options\.conversationId/);
  assert.match(src, /if \(fromOutbox && options\.conversationId\)/);
});

test('outbox service passes options into sendText', () => {
  const surface = readFileSync(join(root, 'src/composition/message-commands-surface.js'), 'utf8');
  const outbox = readFileSync(join(root, 'src/application/message-outbox-service.js'), 'utf8');
  assert.match(surface, /sendText: async \(body, options = \{\}\)/);
  assert.match(outbox, /fromOutbox: true/);
});
