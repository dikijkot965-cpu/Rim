import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('app.js invokes bindMessageCommandsSurface with client and canSend surface has reverse block', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  const surface = readFileSync(join(root, 'src/composition/message-commands-surface.js'), 'utf8');
  assert.match(app, /bindMessageCommandsSurface\s*\(/);
  assert.match(app, /client:\s*legacy\.db/);
  assert.match(surface, /__RIM_MESSAGE_COMMANDS_OWNED/);
  assert.match(surface, /revRes|reverseBlock|ограничил переписку/);
  assert.match(surface, /ограничил переписку/);
});

test('forward service copies image attachment_path and normalized attachment rows', () => {
  const source = readFileSync(join(root, 'src/application/forward-message-service.js'), 'utf8');
  assert.match(source, /chat_message_attachments/);
  assert.match(source, /attachment_path/);
  assert.match(source, /storage\.from\('chat-files'\)\.copy/);
  assert.match(source, /copiedPaths/);
});
