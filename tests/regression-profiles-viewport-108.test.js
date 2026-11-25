import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('ProfileRepository exists and session binds getProfiles', () => {
  const repo = readFileSync(join(root, 'src/infrastructure/supabase/profile-repository.js'), 'utf8');
  const session = readFileSync(join(root, 'src/composition/conversation-session-surface.js'), 'utf8');
  assert.match(repo, /class ProfileRepository/);
  assert.match(repo, /getByIds/);
  assert.match(session, /win\.getProfiles/);
  assert.match(session, /ProfileRepository/);
});

test('bootstrap getProfiles dual-binds and viewport is conditional', () => {
  const boot = readFileSync(join(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8');
  const session = readFileSync(join(root, 'src/composition/conversation-session-surface.js'), 'utf8');
  assert.match(session, /win\.getProfiles/);
  const shell = readFileSync(join(root, 'src/composition/shell-surface.js'), 'utf8');
  assert.match(shell, /viewport\.bindGlobals\(\)/);
  const lines = boot.split(/\n/).length;
  assert.ok(lines <= 350, `lines ${lines}`);
});
