import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('bootstrap under 450 LOC and still dual-binds core owners', () => {
  const boot = readFileSync(join(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8');
  const lines = boot.split(/\n/).length;
  assert.ok(lines < 300, `lines ${lines}`);
  assert.match(boot, /__RIM_APP_BOOTSTRAP_OWNED/);
  assert.match(boot, /__RIM_AUTH_FORM_OWNED/);
  assert.match(boot, /__RIM_MESSAGE_COMMANDS_OWNED/);
  assert.match(boot, /__rimMirrorLegacyState/);
});
