import test from 'node:test';
import assert from 'node:assert/strict';
import { compareMessages, mergeMessageEvent, messageCursor, MessageRepository } from '../src/infrastructure/supabase/message-repository.js';

test('message cursor is stable and rejects incomplete records', () => {
  assert.deepEqual(messageCursor({ id: 'm2', created_at: '2026-11-12T10:00:00Z' }), { id: 'm2', created_at: '2026-11-12T10:00:00Z' });
  assert.equal(messageCursor({ id: 'm1' }), null);
});

test('message ordering uses timestamp then id as deterministic tie-breaker', () => {
  const rows = [{ id: 'b', created_at: '2026-11-12T10:00:00Z' }, { id: 'a', created_at: '2026-11-12T10:00:00Z' }];
  assert.deepEqual(rows.sort(compareMessages).map(x => x.id), ['a', 'b']);
});

test('Realtime INSERT, UPDATE and DELETE merge without duplicates', () => {
  const initial = [{ id: 'a', body: 'one', created_at: '2026-11-12T10:00:00Z' }];
  const inserted = mergeMessageEvent(initial, { eventType: 'INSERT', new: { id: 'b', body: 'two', created_at: '2026-11-12T10:01:00Z' } });
  assert.equal(inserted.length, 2);
  assert.equal(mergeMessageEvent(inserted, { eventType: 'INSERT', new: { id: 'b', body: 'two', created_at: '2026-11-12T10:01:00Z' } }).length, 2);
  const updated = mergeMessageEvent(inserted, { eventType: 'UPDATE', new: { id: 'b', body: 'edited' } });
  assert.equal(updated[1].body, 'edited');
  assert.deepEqual(mergeMessageEvent(updated, { eventType: 'DELETE', old: { id: 'a' } }).map(x => x.id), ['b']);
  assert.equal(mergeMessageEvent(initial, { eventType: 'UPDATE', new: { id: 'not-loaded', body: 'x' } }), initial);
});

test('latest message query fetches newest bounded page and returns chronological order', async () => {
  const state = { calls: [] };
  const rows = [{ id: 'new', created_at: '2026-11-12T10:02:00Z' }, { id: 'old', created_at: '2026-11-12T10:01:00Z' }];
  const query = {
    select(v) { state.select = v; return this; }, eq(...v) { state.calls.push(['eq', ...v]); return this; },
    order(...v) { state.calls.push(['order', ...v]); return this; }, limit(v) { state.limit = v; return Promise.resolve({ data: rows, error: null }); }
  };
  const repo = new MessageRepository({ from: table => { state.table = table; return query; } }, { pageSize: 50 });
  const result = await repo.getLatest('conversation-1');
  assert.equal(result.ok, true);
  assert.equal(state.table, 'chat_messages');
  assert.equal(state.limit, 50);
  assert.deepEqual(result.value.map(x => x.id), ['old', 'new']);
  assert.deepEqual(state.calls.filter(x => x[0] === 'order').map(x => x[1]), ['created_at', 'id']);
});

test('older page query uses the stable composite cursor and returns chronological order', async () => {
  const state = { calls: [] };
  const rows = [
    { id: 'older-2', created_at: '2026-11-12T09:59:00Z' },
    { id: 'older-1', created_at: '2026-11-12T09:58:00Z' }
  ];
  const query = {
    select() { return this; }, eq(...v) { state.calls.push(['eq', ...v]); return this; },
    or(v) { state.cursor = v; return this; }, order(...v) { state.calls.push(['order', ...v]); return this; },
    limit(v) { state.limit = v; return Promise.resolve({ data: rows, error: null }); }
  };
  const repo = new MessageRepository({ from: table => { state.table = table; return query; } });
  const result = await repo.getBefore('conversation-1', { created_at: '2026-11-12T10:00:00Z', id: 'cursor-id' });
  assert.equal(result.ok, true);
  assert.match(state.cursor, /created_at\.lt\./);
  assert.match(state.cursor, /id\.lt\.cursor-id/);
  assert.deepEqual(result.value.map(x => x.id), ['older-1', 'older-2']);
  assert.equal(state.limit, 50);
});

test('message edit and delete queries are scoped by message, author and conversation', async () => {
  const calls = [];
  const query = {
    update(value) { calls.push(['update', value]); return this; },
    delete() { calls.push(['delete']); return this; },
    eq(key, value) { calls.push(['eq', key, value]); return this; },
    select(value) { calls.push(['select', value]); return this; },
    maybeSingle() { return Promise.resolve({ data: { id: 'm1' }, error: null }); }
  };
  const repository = new MessageRepository({ from: table => { calls.push(['from', table]); return query; } });
  assert.equal((await repository.update('m1', 'u1', 'edited', 'c1')).ok, true);
  assert.equal((await repository.remove('m1', 'u1', 'c1')).ok, true);
  const filters = calls.filter(call => call[0] === 'eq');
  assert.deepEqual(filters, [
    ['eq', 'id', 'm1'], ['eq', 'sender_id', 'u1'], ['eq', 'conversation_id', 'c1'],
    ['eq', 'id', 'm1'], ['eq', 'sender_id', 'u1'], ['eq', 'conversation_id', 'c1']
  ]);
});


test('offline replay uses an idempotent upsert and resolves the existing row on retry', async () => {
  const calls = [];
  const insertQuery = {
    upsert(payload, options) { calls.push(['upsert', payload, options]); return this; },
    select(fields) { calls.push(['select', fields]); return this; },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); }
  };
  const lookupQuery = {
    select(fields) { calls.push(['lookup-select', fields]); return this; },
    eq(key, value) { calls.push(['lookup-eq', key, value]); return this; },
    single() { return Promise.resolve({ data: { id: 'server-message-1', body: 'same payload' }, error: null }); }
  };
  let fromCalls = 0;
  const repo = new MessageRepository({ from(table) {
    assert.equal(table, 'chat_messages');
    fromCalls += 1;
    return fromCalls === 1 ? insertQuery : lookupQuery;
  } });
  const result = await repo.insert({ sender_id: 'user-1', conversation_id: 'c1', body: 'same payload', client_message_id: 'obx_stable' });
  assert.equal(result.ok, true);
  assert.equal(result.value.id, 'server-message-1');
  assert.deepEqual(calls[0][2], { onConflict: 'sender_id,client_message_id', ignoreDuplicates: true });
  assert.ok(calls.some(call => call[0] === 'lookup-eq' && call[1] === 'client_message_id' && call[2] === 'obx_stable'));
});
