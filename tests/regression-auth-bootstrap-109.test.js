import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('bootstrap auth dual-binds to AuthFormController', () => {
  const boot = readFileSync(join(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8');
  assert.match(boot, /__RIM_AUTH_FORM_OWNED.*signIn/s);
  assert.match(boot, /__RIM_AUTH_FORM_OWNED.*signUp/s);
  assert.match(boot, /__RIM_AUTH_FORM_OWNED.*showLoginForm/s);
  const lines = boot.split(/\n/).length;
  assert.ok(lines < 300, `lines ${lines}`);
});
