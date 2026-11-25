import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('bootstrap auth dual-binds to AuthFormController', () => {
  const entry = readFileSync(join(root, 'src/application/auth-entrypoint.js'), 'utf8');
  const controller = readFileSync(join(root, 'src/application/auth-form-controller.js'), 'utf8');
  assert.match(entry, /new AuthFormController/);
  assert.match(entry, /controller\.bindGlobals\(\)/);
  assert.match(controller, /win\.signIn =/);
  assert.match(controller, /win\.signUp =/);
  assert.match(controller, /win\.showLoginForm =/);
});
