import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOutboxItem,
  markOutboxSending,
  markOutboxSent,
  markOutboxFailed,
  listRetryable,
  isNetworkLikeError
} from '../src/domain/outbox.js';
import { MessageOutboxService } from '../src/application/message-outbox-service.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('outbox item lifecycle', () => {
  const created = createOutboxItem({ userId: 'user-1', conversationId: 'c1', body: 'Слава' });
  assert.equal(created.ok, true);
  const sending = markOutboxSending(created.value);
  assert.equal(sending.value.status, 'sending');
  assert.equal(sending.value.attempts, 1);
  const sent = markOutboxSent(sending.value);
  assert.equal(sent.value.status, 'sent');
  const failed = markOutboxFailed(sending.value, 'offline');
  assert.equal(failed.value.status, 'failed');
  assert.equal(listRetryable([created.value, failed.value]).length, 1);
  assert.equal(listRetryable([created.value, failed.value], Date.now() + 60000).length, 2);
});

test('network error detection', () => {
  assert.equal(isNetworkLikeError(new Error('Failed to fetch')), true);
  assert.equal(isNetworkLikeError(new Error('validation failed')), false);
});

test('MessageOutboxService persists and flushes', async () => {
  const mem = {
    data: {},
    getItem(k) { return this.data[k] ?? null; },
    setItem(k, v) { this.data[k] = String(v); }
  };
  let calls = 0;
  const service = new MessageOutboxService({
    storage: mem,
    sendText: async (body) => {
      calls += 1;
      assert.equal(body, 'Привет');
      return { ok: true, value: { id: 'm1' } };
    },
    getUserId: () => 'user-1',
    windowRef: { navigator: { onLine: true }, addEventListener() {}, removeEventListener() {} }
  });
  const queued = service.enqueueText({ userId: 'user-1', conversationId: 'c1', body: 'Привет' });
  assert.equal(queued.ok, true);
  assert.equal(service.list().length, 1);
  const flushed = await service.flush();
  assert.equal(flushed.ok, true);
  assert.equal(calls, 1);
  assert.equal(service.list().length, 0);
});

test('surface owns outbox flag', () => {
  const src = readFileSync(join(root, 'src/composition/message-commands-surface.js'), 'utf8');
  assert.match(src, /MessageOutboxService/);
  assert.match(src, /__RIM_MESSAGE_OUTBOX_OWNED/);
  assert.match(src, /isNetworkLikeError/);
});

test('outbox is isolated by account and refuses unowned messages', () => {
  const mem = { data: {}, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = String(v); } };
  let owner = 'user-a';
  const service = new MessageOutboxService({ storage: mem, getUserId: () => owner, windowRef: { addEventListener() {}, removeEventListener() {}, navigator: { onLine: false } } });
  assert.equal(service.enqueueText({ conversationId: 'c1', body: 'A' }).ok, true);
  assert.equal(service.list().length, 1);
  owner = 'user-b';
  assert.equal(service.list().length, 0);
  assert.equal(service.enqueueText({ userId: 'user-a', conversationId: 'c1', body: 'wrong owner' }).ok, false);
  owner = 'user-a';
  assert.equal(service.list().length, 1);
});

test('outbox fails closed when local persistence fails', () => {
  const service = new MessageOutboxService({
    storage: { getItem() { return null; }, setItem() { throw new Error('quota'); } },
    getUserId: () => 'user-a',
    windowRef: { addEventListener() {}, removeEventListener() {}, navigator: { onLine: false } }
  });
  const result = service.enqueueText({ conversationId: 'c1', body: 'Не терять' });
  assert.equal(result.ok, false);
  assert.match(result.error.message, /сохранить сообщение/);
});


test('outbox preserves conversation type for server-side direct-chat policy checks', async () => {
  const mem = { data: {}, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = String(v); } };
  let received = null;
  const service = new MessageOutboxService({
    storage: mem,
    getUserId: () => 'user-a',
    sendText: async (_body, options) => { received = options; return { ok: true }; },
    windowRef: { navigator: { onLine: true }, addEventListener() {}, removeEventListener() {} }
  });
  service.enqueueText({ userId: 'user-a', conversationId: 'c1', conversationType: 'direct', body: 'queued' });
  await service.flush();
  assert.equal(received.conversationType, 'direct');
  assert.equal(received.expectedUserId, 'user-a');
});

test('outbox preserves private-group status for safe E2E scope checks on retry', async () => {
  const mem = { data: {}, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = String(v); } };
  let received = null;
  const service = new MessageOutboxService({
    storage: mem,
    getUserId: () => 'user-a',
    sendText: async (_body, options) => { received = options; return { ok: true }; },
    windowRef: { navigator: { onLine: true }, addEventListener() {}, removeEventListener() {} }
  });
  service.enqueueText({ userId: 'user-a', conversationId: 'g1', conversationType: 'group', conversationIsPrivate: false, body: 'queued' });
  await service.flush();
  assert.equal(received.conversationType, 'group');
  assert.equal(received.conversationIsPrivate, false);
});
