import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('chat info exposes E2E verification for eligible secret direct chats', () => {
  const source = readFileSync(join(root, 'src/application/chat-info-controller.js'), 'utf8');
  assert.match(source, /conversation\.type === 'direct' && \(conversation\.is_secret === true \|\| \['pending','required'\]\.includes\(conversation\.e2e_mode\)\)/);
  assert.match(source, /rimVerifyE2E\(\)/);
});
