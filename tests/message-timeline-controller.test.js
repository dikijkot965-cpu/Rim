import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageTimelineController } from '../src/application/message-timeline-controller.js';

function fixture() {
  let conversation = { id: 'c1' };
  let rows = [];
  let realtimeHandler;
  const queries = [];
  const repository = {
    client: {
      channel() { return { on(_event, _filter, handler) { realtimeHandler = handler; return this; }, subscribe(callback) { queueMicrotask(() => callback('SUBSCRIBED')); return this; } }; },
      async removeChannel() {}
    },
    async getLatest(id) { queries.push(id); return { ok: true, value: [{ id: 'm1', conversation_id: id, body: 'from-db', created_at: '2026-11-13T10:00:00Z' }] }; },
    async getBefore() { return { ok: true, value: [] }; }
  };
  const controller = new MessageTimelineController({ repository, getConversation: () => conversation, getMessages: () => rows, setMessages: value => { rows = value; }, render: async () => {}, logger: { warn() {} } });
  return { controller, get rows() { return rows; }, set conversation(value) { conversation = value; }, queries, emit(payload) { realtimeHandler?.(payload); } };
}

test('latest load reconciles Realtime INSERT received while the database request is pending', async () => {
  const f = fixture();
  let resolveQuery;
  f.controller.repository.getLatest = () => new Promise(resolve => { resolveQuery = resolve; });
  const loading = f.controller.loadLatest();
  await Promise.resolve();
  await f.controller.applyRealtime({ eventType: 'INSERT', new: { id: 'm2', conversation_id: 'c1', body: 'realtime', created_at: '2026-11-13T10:01:00Z' } });
  resolveQuery({ ok: true, value: [{ id: 'm1', conversation_id: 'c1', body: 'from-db', created_at: '2026-11-13T10:00:00Z' }] });
  await loading;
  assert.deepEqual(f.rows.map(row => row.id), ['m1', 'm2']);
});

test('subscription remains active after a later history reload', async () => {
  const f = fixture();
  await f.controller.loadLatest();
  await f.controller.subscribe();
  await f.controller.loadLatest(); // Must not invalidate the subscription epoch.
  f.emit({ eventType: 'INSERT', new: { id: 'm2', conversation_id: 'c1', body: 'new', created_at: '2026-11-13T10:01:00Z' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.rows.some(row => row.id === 'm2'));
});

test('stale conversation Realtime payloads are ignored', async () => {
  const f = fixture();
  await f.controller.loadLatest();
  await f.controller.applyRealtime({ eventType: 'INSERT', new: { id: 'other', conversation_id: 'c2', body: 'wrong chat', created_at: '2026-11-13T10:01:00Z' } });
  assert.deepEqual(f.rows.map(row => row.id), ['m1']);
});

test('an older-page request for the previous chat does not block pagination in the newly active chat', async () => {
  const f = fixture();
  let releaseFirst;
  let beforeCalls = 0;
  f.controller.repository.getBefore = id => {
    beforeCalls++;
    if (id === 'c1') return new Promise(resolve => { releaseFirst = resolve; });
    return Promise.resolve({ ok: true, value: [{ id: 'c2-old', conversation_id: 'c2', created_at: '2026-11-12T10:00:00Z' }] });
  };
  f.controller.setMessages([{ id: 'c1-new', conversation_id: 'c1', created_at: '2026-11-14T10:00:00Z' }]);
  f.controller.hasOlder = true;
  const first = f.controller.loadOlder();
  await Promise.resolve();
  f.conversation = { id: 'c2' };
  await f.controller.loadLatest();
  f.controller.setMessages([{ id: 'c2-new', conversation_id: 'c2', created_at: '2026-11-14T11:00:00Z' }]);
  f.controller.hasOlder = true;
  const second = await f.controller.loadOlder();
  assert.equal(beforeCalls, 2);
  assert.deepEqual(second.map(row => row.id), ['c2-old']);
  releaseFirst({ ok: true, value: [{ id: 'c1-old', conversation_id: 'c1', created_at: '2026-11-13T10:00:00Z' }] });
  await first;
  assert.equal(f.controller.loadingOlder, false);
});

test('page size is bounded to a safe integer range', () => {
  const f = fixture();
  f.controller.pageSize = 999;
  const bounded = new MessageTimelineController({
    repository: f.controller.repository,
    getConversation: () => ({ id: 'c1' }), getMessages: () => [], setMessages() {}, render() {}, pageSize: 999
  });
  assert.equal(bounded.pageSize, 200);
});

test('stale subscription request cannot attach after a newer conversation wins', async () => {
  const f = fixture();
  const attached = [];
  let releaseRemoval;
  let removalStarted = false;
  f.controller.repository.client.channel = name => {
    attached.push(name);
    return { on() { return this; }, subscribe() { return this; } };
  };
  f.controller.repository.client.removeChannel = async () => {
    if (!removalStarted) {
      removalStarted = true;
      await new Promise(resolve => { releaseRemoval = resolve; });
    }
  };

  await f.controller.subscribe();
  f.conversation = { id: 'c2' };
  const stale = f.controller.subscribe();
  await Promise.resolve();
  f.conversation = { id: 'c3' };
  const current = f.controller.subscribe();
  await current;
  releaseRemoval();
  await stale;

  assert.deepEqual(attached, ['rim-message-timeline-c1', 'rim-message-timeline-c3']);
  assert.equal(f.controller.channelId, 'c3');
});

test('older-page locks are tracked independently per conversation', async () => {
  const f = fixture();
  let releaseFirst;
  let releaseSecond;
  f.controller.repository.getBefore = id => id === 'c1'
    ? new Promise(resolve => { releaseFirst = resolve; })
    : new Promise(resolve => { releaseSecond = resolve; });

  f.controller.setMessages([{ id: 'c1-new', conversation_id: 'c1', created_at: '2026-11-14T10:00:00Z' }]);
  f.controller.hasOlder = true;
  const first = f.controller.loadOlder();
  await Promise.resolve();
  f.conversation = { id: 'c2' };
  await f.controller.loadLatest();
  f.controller.setMessages([{ id: 'c2-new', conversation_id: 'c2', created_at: '2026-11-14T11:00:00Z' }]);
  f.controller.hasOlder = true;
  const second = f.controller.loadOlder();
  assert.equal(f.controller.loadingOlder, true);
  releaseFirst({ ok: true, value: [{ id: 'c1-old', conversation_id: 'c1', created_at: '2026-11-13T10:00:00Z' }] });
  await first;
  assert.equal(f.controller.loadingOlder, true, 'completion for c1 must not clear c2 lock');
  releaseSecond({ ok: true, value: [{ id: 'c2-old', conversation_id: 'c2', created_at: '2026-11-12T10:00:00Z' }] });
  await second;
  assert.equal(f.controller.loadingOlder, false);
});
