import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('Google auth wired in HTML, controller and bootstrap', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const auth = readFileSync(join(root, 'src/application/auth-form-controller.js'), 'utf8');
  const boot = readFileSync(join(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8');
  assert.match(html, /googleAuthBtn/);
  assert.match(html, /signInWithGoogle/);
  assert.match(auth, /signInWithGoogle/);
  assert.match(auth, /signInWithOAuth/);
  assert.match(auth, /provider:\s*['"]google['"]/);
  assert.match(boot, /signInWithGoogle/);
});
