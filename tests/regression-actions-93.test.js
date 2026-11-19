import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test('message actions restored in renderer and commands', () => {
  const renderer = readFileSync(join(root, 'src/application/message-list-renderer.js'), 'utf8');
  const commands = readFileSync(join(root, 'src/composition/message-commands-surface.js'), 'utf8');
  const css = readFileSync(join(root, 'assets/css/rim.css'), 'utf8');
  assert.match(renderer, /#openMessageSheet|openMessageSheet/);
  assert.match(renderer, /data-rim-msg-action="forward"/);
  assert.match(commands, /rimOpenMessageActions/);
  assert.match(commands, /rimForwardChoose/);
  assert.match(css, /rim-msg-sheet/);
});
test('rimAdmin and channel row styles present', () => {
  const admin = readFileSync(join(root, 'src/composition/admin-surface.js'), 'utf8');
  const css = readFileSync(join(root, 'assets/css/rim.css'), 'utf8');
  assert.match(admin, /win\.rimAdmin\s*=/);
  assert.match(css, /rim-channel-row/);
  assert.match(css, /feature-tile/);
  assert.match(css, /rim-auth-eye/);
});
