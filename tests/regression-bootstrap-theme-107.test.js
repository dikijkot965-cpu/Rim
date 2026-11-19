import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('bootstrap theme changes dual-bind to appearance owner', () => {
  const boot = readFileSync(join(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8');
  assert.match(boot, /__RIM_APPEARANCE_OWNED.*changeTheme/s);
  assert.match(boot, /Модуль оформления ещё загружается/);
  assert.match(boot, /__RIM_BACK_TO_CHATS_OWNED|function backToChats/);
  const lines = boot.split(/\n/).length;
  assert.ok(lines < 820, `lines ${lines}`);
});
