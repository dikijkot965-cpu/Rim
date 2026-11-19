import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MessageOutboxService } from '../src/application/message-outbox-service.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('renderer shows outbox pending marker', () => {
  const src = readFileSync(join(root, 'src/application/message-list-renderer.js'), 'utf8');
  assert.match(src, /_rimOutboxPending/);
  assert.match(src, /resolveDeliveryStatus|_rimOutboxPending/);
  assert.match(src, /getOutboxMessages/);
});

test('outbox toLocalMessages shapes pending rows', () => {
  const mem = { data: {}, getItem(k){return this.data[k]??null;}, setItem(k,v){this.data[k]=String(v);} };
  const service = new MessageOutboxService({
    storage: mem,
    getUserId: () => 'user-1',
    windowRef: { addEventListener(){}, removeEventListener(){}, navigator: { onLine: true } }
  });
  service.enqueueText({ userId: 'user-1', conversationId: 'c1', body: 'Ждём сеть' });
  const rows = service.toLocalMessages('c1', 'user-1');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]._rimOutboxPending, true);
  assert.equal(rows[0].body, 'Ждём сеть');
  assert.match(rows[0].id, /^outbox:/);
});

test('package verify includes soft e2e', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.verify, /test:e2e/);
});

test('outbox requeues stale sending items after restart', () => {
  const ownerKey = 'rim.outbox.v2.user-1';
  const mem = { data: { [ownerKey]: JSON.stringify([{ id: 'obx1', userId: 'user-1', conversationId: 'c1', body: 'x', status: 'sending' }]) }, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = String(v); } };
  const service = new MessageOutboxService({ storage: mem, getUserId: () => 'user-1', windowRef: { addEventListener() {}, removeEventListener() {} } });
  assert.equal(service.list()[0].status, 'pending');
});
