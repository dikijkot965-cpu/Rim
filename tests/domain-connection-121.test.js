import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveConnectionStatus, CONNECTION } from '../src/domain/connection.js';
import { ConnectionStatusController } from '../src/application/connection-status-controller.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('connection status labels', () => {
  assert.equal(resolveConnectionStatus({ online: true }).status, CONNECTION.ONLINE);
  assert.equal(resolveConnectionStatus({ online: false }).status, CONNECTION.OFFLINE);
  assert.equal(resolveConnectionStatus({ online: true, reconnecting: true }).status, CONNECTION.RECONNECTING);
});

test('controller writes chat head status', () => {
  const el = { textContent: '', dataset: {} };
  const doc = { getElementById: (id) => id === 'chatHeadStatus' ? el : null };
  const win = {
    navigator: { onLine: false },
    addEventListener() {},
    removeEventListener() {}
  };
  const c = new ConnectionStatusController({ documentRef: doc, windowRef: win });
  const snap = c.refresh();
  assert.equal(snap.status, CONNECTION.OFFLINE);
  assert.match(el.textContent, /Нет сети/);
  assert.equal(el.dataset.rimConnection, CONNECTION.OFFLINE);
});

test('shell binds connection status owner', () => {
  const shell = readFileSync(join(root, 'src/composition/shell-surface.js'), 'utf8');
  assert.match(shell, /ConnectionStatusController/);
  assert.match(shell, /__RIM_CONNECTION_STATUS_OWNED/);
});
