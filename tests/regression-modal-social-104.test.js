import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('ShellModalController owns modal globals', () => {
  const modal = readFileSync(join(root, 'src/application/shell-modal-controller.js'), 'utf8');
  const shell = readFileSync(join(root, 'src/composition/shell-surface.js'), 'utf8');
  assert.match(modal, /class ShellModalController/);
  assert.match(modal, /__RIM_MODAL_OWNED/);
  assert.match(shell, /ShellModalController/);
});

test('social surface assigns peer profile and start chat', () => {
  const social = readFileSync(join(root, 'src/composition/social-surface.js'), 'utf8');
  assert.match(social, /win\.showUserProfile =/);
  assert.match(social, /win\.startChatWith =/);
  assert.match(social, /__RIM_DIRECT_CHAT_OWNED/);
});

test('bootstrap modal and direct-chat are dual-bound stubs', () => {
  const boot = readFileSync(join(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8');
  assert.match(shell, /shellModal\.bindGlobals\(\)/);
  assert.match(social, /__RIM_DIRECT_CHAT_OWNED/);
  assert.match(boot, /async function openConversation/);
  const lines = boot.split(/\n/).length;
  assert.ok(lines <= 350, `lines ${lines}`);
});
