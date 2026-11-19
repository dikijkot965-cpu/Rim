import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationRepository } from '../src/infrastructure/supabase/conversation-repository.js';
import { resolveChatHeader } from '../src/application/resolve-chat-header.js';

function clientFor({ members = [], profiles = [], memberError = null, profileError = null } = {}) {
  return {
    from(table) {
      const query = { filters: [], select() { return this; }, in(column, values) { this.filters.push([column, values]); return this; } };
      query.then = undefined;
      if (table === 'conversation_members') {
        query.then = (resolve) => resolve({ data: members, error: memberError });
      } else if (table === 'profiles') {
        query.then = (resolve) => resolve({ data: profiles, error: profileError });
      }
      return query;
    }
  };
}

test('bulk peer resolver returns the other participant and fails closed for presence', async () => {
  const db = clientFor({
    members: [{ conversation_id: 'c1', user_id: 'me' }, { conversation_id: 'c1', user_id: 'peer' }],
    profiles: [{ id: 'peer', display_name: 'Анна', username: 'anna', show_online: null }]
  });
  const result = await new ConversationRepository(db).getDirectPeer('c1', 'me');
  assert.equal(result.ok, true);
  assert.equal(result.value.display_name, 'Анна');
  assert.equal(result.value.showOnline, false);
});

test('bulk peer resolver maps each conversation independently', async () => {
  const db = clientFor({
    members: [
      { conversation_id: 'c1', user_id: 'me' }, { conversation_id: 'c1', user_id: 'p1' },
      { conversation_id: 'c2', user_id: 'me' }, { conversation_id: 'c2', user_id: 'p2' }
    ],
    profiles: [{ id: 'p1', username: 'one' }, { id: 'p2', username: 'two' }]
  });
  const result = await new ConversationRepository(db).getDirectPeers(['c1','c2'], 'me');
  assert.equal(result.ok, true);
  assert.equal(result.value.c1.username, 'one');
  assert.equal(result.value.c2.username, 'two');
});

test('direct header uses a profile already attached to the conversation', async () => {
  const result = await resolveChatHeader({
    conversation: { id: 'c1', type: 'direct', other_profile: { display_name: 'Мария' } },
    user: { id: 'me' },
    repository: { getDirectPeer: async () => ({ ok: true, value: null }) },
    logger: { warn() {} }
  });
  assert.equal(result.title, 'Мария');
  assert.equal(result.peer.display_name, 'Мария');
});

test('direct peer query returns a missing peer without throwing', async () => {
  const db = clientFor({ members: [{ conversation_id: 'c1', user_id: 'me' }], profiles: [] });
  const result = await new ConversationRepository(db).getDirectPeer('c1', 'me');
  assert.deepEqual(result, { ok: true, value: null });
});


test('cached direct peer refreshes only presence instead of repeating membership and profile lookup', async () => {
  const calls = [];
  const result = await resolveChatHeader({
    conversation: { id: 'c1', type: 'direct', other_profile: { id: 'peer', username: 'anna', display_name: 'Анна' } },
    user: { id: 'me' },
    repository: {
      async getPeerPresence(id) { calls.push(['presence', id]); return { ok: true, value: { showOnline: true, last_seen_at: '2026-11-13T11:00:00Z' } }; },
      async getDirectPeer() { calls.push(['membership']); throw new Error('should not be called'); }
    },
    logger: { warn() {} }
  });
  assert.equal(result.title, 'Анна');
  assert.equal(result.peer.last_seen_at, '2026-11-13T11:00:00Z');
  assert.deepEqual(calls, [['presence', 'peer']]);
});
