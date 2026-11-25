import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('bootstrap under 450 LOC and still dual-binds core owners', () => {
  const boot = readFileSync(join(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8');
  const shell = readFileSync(join(root, 'src/composition/shell-surface.js'), 'utf8');
  const auth = readFileSync(join(root, 'src/application/auth-entrypoint.js'), 'utf8');
  const commands = readFileSync(join(root, 'src/composition/message-commands-surface.js'), 'utf8');
  const lines = boot.split(/\n/).length;
  assert.ok(lines <= 350, `lines ${lines}`);
  assert.match(shell, /__RIM_APP_BOOTSTRAP_OWNED/);
  assert.match(auth, /controller\.bindGlobals\(\)/);
  assert.match(commands, /__RIM_MESSAGE_COMMANDS_OWNED/);
  assert.match(boot, /__rimMirrorLegacyState/);
});
