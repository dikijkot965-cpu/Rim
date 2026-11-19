import test from 'node:test';
import assert from 'node:assert/strict';
import { Ok, Err, fromSupabase } from '../src/core/result.js';
import { EventBus } from '../src/core/event-bus.js';
import { Container } from '../src/core/container.js';
import { normalizeError, RimError } from '../src/core/errors.js';
import { displayConversationTitle } from '../src/domain/conversation.js';

test('Result keeps success and failure explicit', () => {
  assert.deepEqual(Ok(7), { ok: true, value: 7 });
  assert.equal(Err('bad').ok, false);
  assert.equal(fromSupabase({ data: 3, error: null }).value, 3);
  assert.equal(fromSupabase({ data: null, error: new Error('x') }).ok, false);
});
test('EventBus unsubscribes and dispatches payload', () => {
  const bus = new EventBus(); let value = 0; const off = bus.on('x', n => value += n);
  bus.emit('x', 2); off(); bus.emit('x', 9); assert.equal(value, 2);
});
test('Container resolves singleton dependencies', () => {
  const c = new Container(); let count = 0; c.factory('dep', () => ({ id: ++count }));
  assert.equal(c.get('dep'), c.get('dep')); assert.equal(count, 1);
});
test('normalizeError preserves domain error identity', () => {
  const original = new RimError('AUTH', 'No access'); assert.equal(normalizeError(original), original);
  assert.equal(normalizeError(new Error('Oops'), 'cid').correlationId, 'cid');
});
test('direct chat title resolves to peer, never generic label when peer is known', () => {
  assert.equal(displayConversationTitle({ type: 'direct', title: null }, { display_name: 'Анна' }), 'Анна');
  assert.equal(displayConversationTitle({ type: 'direct' }, { username: 'anna' }), 'anna');
  assert.equal(displayConversationTitle({ type: 'group', title: 'Совет' }, null), 'Совет');
});

import { ConversationRepository } from '../src/infrastructure/supabase/conversation-repository.js';

test('direct peer reads the public privacy projection with the peer profile', async () => {
  const calls = [];
  const client = {
    from(table) {
      const state = { table, filters: [] }; calls.push(state);
      const query = {
        select(columns) { state.columns = columns; return query; },
        eq(key, value) { state.filters.push([key, value]); return query; },
        neq(key, value) { state.filters.push([key, value]); return query; },
        in(key, value) { state.filters.push([key, value]); return query; },
        then(resolve) { return Promise.resolve(state.table === 'conversation_members' ? { data: [{ conversation_id: 'conversation-1', user_id: 'peer-1' }], error: null } : { data: [{ id: 'peer-1', display_name: 'Анна', last_seen_at: '2026-11-06T10:00:00Z', show_online: false }], error: null }).then(resolve); },
        limit(value) { state.limit = value; return Promise.resolve({ data: [{ user_id: 'peer-1' }], error: null }); },
        maybeSingle() { return Promise.resolve({ data: { id: 'peer-1', display_name: 'Анна', last_seen_at: '2026-11-06T10:00:00Z', show_online: false }, error: null }); }
      };
      return query;
    }
  };
  const result = await new ConversationRepository(client).getDirectPeer('conversation-1', 'me');
  assert.equal(result.ok, true);
  assert.equal(result.value.display_name, 'Анна');
  assert.equal(result.value.showOnline, false);
  assert.equal(calls.find(x => x.table === 'profiles').columns.includes('show_online'), true);
  assert.equal(calls.some(x => x.table === 'user_settings'), false);
});

