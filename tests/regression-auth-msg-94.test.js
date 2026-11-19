import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test('registration startRegistration exists in bootstrap', () => {
  const boot = readFileSync(join(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8');
  assert.match(boot, /function startRegistration/);
  assert.match(boot, /function rimTogglePassword/);
  assert.match(boot, /function rimResetPassword/);
});
test('imperial features bulletin and TG message sheet', () => {
  const feat = readFileSync(join(root, 'src/application/imperial-features-controller.js'), 'utf8');
  const renderer = readFileSync(join(root, 'src/application/message-list-renderer.js'), 'utf8');
  const css = readFileSync(join(root, 'assets/css/rim.css'), 'utf8');
  assert.match(feat, /openBulletinBoard/);
  assert.match(feat, /openNotifications/);
  assert.match(renderer, /rim-msg-sheet|#openMessageSheet/);
  assert.match(css, /rim-msg-sheet/);
});
test('composer has attach and mic controls', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.match(html, /rimAttachBtn/);
  assert.match(html, /rimVoiceBtn/);
});
