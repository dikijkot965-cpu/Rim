import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('app routes conversation list load through ConversationListController', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  const entrypoints = readFileSync(join(root, 'src/composition/legacy-entrypoint-surface.js'), 'utf8');
  assert.match(app, /bindLegacyEntrypointSurface/);
  assert.match(entrypoints, /conversationList\.load\(\)/);
  assert.match(app, /setConversations:\s*legacy\.setConversations/);
  assert.match(app, /4\.1\.8-iteration\.163/);
});

test('legacy context exposes setConversations for modular list load', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.match(html, /setConversations:\s*rows\s*=>\s*\{\s*conversations\s*=/);
});

test('conversation repository defines listForUser', () => {
  const source = readFileSync(join(root, 'src/infrastructure/supabase/conversation-repository.js'), 'utf8');
  assert.match(source, /async listForUser\(userId\)/);
});
