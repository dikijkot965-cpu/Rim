import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationRepository } from '../src/infrastructure/supabase/conversation-repository.js';

function createClient({ members = [], profiles = [], presence = [], failTable = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const state = { table, selection: '' };
      const query = {
        select(value) { state.selection = value; return this; },
        eq(column, value) { state.eq = [column, value]; calls.push({ table, selection: state.selection, column, value }); return this; },
        maybeSingle() { const data = profiles.find(row => String(row.id) === String(state.eq?.[1])) || null; return Promise.resolve({ data, error: null }); },
        in(column, values) {
          calls.push({ table, selection: state.selection, column, values: [...values] });
          if (table === failTable) return Promise.resolve({ data: null, error: new Error(`${table} failed`) });
          if (table === 'conversation_members') {
            const data = members.filter(row => values.includes(String(row.conversation_id)));
            return Promise.resolve({ data, error: null });
          }
          if (state.selection.startsWith('id,last_seen_at')) {
            const data = presence.filter(row => values.includes(String(row.id)));
            return Promise.resolve({ data, error: null });
          }
          const data = profiles.filter(row => values.includes(String(row.id)));
          return Promise.resolve({ data, error: null });
        }
      };
      return query;
    }
  };
}

test('direct peer lookup chunks large lists and only reads visible presence', async () => {
  const members = [];
  const profiles = [];
  const presence = [];
  for (let i = 0; i < 205; i++) {
    members.push({ conversation_id: `c${i}`, user_id: 'me' }, { conversation_id: `c${i}`, user_id: `p${i}` });
    profiles.push({ id: `p${i}`, username: `user${i}`, show_online: i % 2 === 0 });
    if (i % 2 === 0) presence.push({ id: `p${i}`, last_seen_at: '2026-11-13T10:00:00Z' });
  }
  const client = createClient({ members, profiles, presence });
  const repository = new ConversationRepository(client, { batchSize: 100 });
  const result = await repository.getDirectPeers(Array.from({ length: 205 }, (_, i) => `c${i}`), 'me');

  assert.equal(result.ok, true);
  assert.equal(Object.keys(result.value).length, 205);
  assert.equal(result.value.c0.last_seen_at, '2026-11-13T10:00:00Z');
  assert.equal(result.value.c1.last_seen_at, null);
  const memberCalls = client.calls.filter(call => call.table === 'conversation_members');
  const profileCalls = client.calls.filter(call => call.table === 'profiles' && call.selection.startsWith('id,username'));
  const presenceCalls = client.calls.filter(call => call.table === 'profiles' && call.selection.startsWith('id,last_seen_at'));
  assert.deepEqual(memberCalls.map(call => call.values.length), [100, 100, 5]);
  assert.deepEqual(profileCalls.map(call => call.values.length), [100, 100, 5]);
  assert.deepEqual(presenceCalls.map(call => call.values.length), [100, 3]);
  assert.ok(client.calls.every(call => call.values.length <= 100));
});

test('direct peer lookup returns an empty result without querying for empty inputs', async () => {
  const client = createClient();
  const repository = new ConversationRepository(client);
  assert.deepEqual((await repository.getDirectPeers([], 'me')).value, {});
  assert.deepEqual((await repository.getDirectPeers(['c1'], null)).value, {});
  assert.equal(client.calls.length, 0);
});

test('repository surfaces a membership query error without continuing', async () => {
  const client = createClient({ failTable: 'conversation_members' });
  const result = await new ConversationRepository(client).getDirectPeers(['c1'], 'me');
  assert.equal(result.ok, false);
  assert.match(result.error.message, /conversation_members failed/);
  assert.equal(client.calls.length, 1);
});


test('conversation-list peer lookup skips last-seen queries to reduce startup round trips', async () => {
  const client = createClient({
    members: [{ conversation_id: 'c1', user_id: 'me' }, { conversation_id: 'c1', user_id: 'peer' }],
    profiles: [{ id: 'peer', username: 'peer', show_online: true }],
    presence: [{ id: 'peer', last_seen_at: '2026-11-13T10:00:00Z' }]
  });
  const result = await new ConversationRepository(client).getDirectPeers(['c1'], 'me', { includePresence: false });
  assert.equal(result.ok, true);
  assert.equal(result.value.c1.last_seen_at, null);
  assert.equal(client.calls.filter(call => call.selection.startsWith('id,last_seen_at')).length, 0);
  assert.equal(client.calls.length, 2);
});


test('cached peer presence refresh reads one profile row without resolving membership again', async () => {
  const client = createClient({ profiles: [{ id: 'peer', show_online: true, last_seen_at: '2026-11-13T11:00:00Z' }] });
  const result = await new ConversationRepository(client).getPeerPresence('peer');
  assert.deepEqual(result.value, { showOnline: true, last_seen_at: '2026-11-13T11:00:00Z' });
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].table, 'profiles');
  assert.equal(client.calls[0].column, 'id');
});

test('conversation state repository reads cursors, exact unread counts, latest preview and read writes', async () => {
  const calls = [];
  const responseRows = {
    conversation_read_state: [{ conversation_id: 'c1', last_read_at: '2026-11-14T10:00:00Z' }],
    chat_messages: [{ id: 'm9', conversation_id: 'c1', sender_id: 'peer', body: 'Последнее', created_at: '2026-11-14T11:00:00Z' }]
  };
  const client = {
    from(table) {
      const state = { table, filters: [], orders: [] };
      calls.push(state);
      const query = {
        select(columns, options) { state.columns = columns; state.options = options; return this; },
        eq(column, value) { state.filters.push(['eq', column, value]); return this; },
        neq(column, value) { state.filters.push(['neq', column, value]); return this; },
        gt(column, value) { state.filters.push(['gt', column, value]); return this; },
        in(column, values) { state.filters.push(['in', column, [...values]]); return this; },
        order(column, options) { state.orders.push([column, options]); return this; },
        limit(value) { state.limit = value; return this; },
        maybeSingle() { return Promise.resolve({ data: responseRows.chat_messages[0], error: null }); },
        upsert(payload, options) { state.payload = payload; state.upsertOptions = options; return Promise.resolve({ error: null }); },
        then(resolve, reject) {
          if (state.options?.head) return Promise.resolve({ count: 4, error: null }).then(resolve, reject);
          return Promise.resolve({ data: responseRows[table] || [], error: null }).then(resolve, reject);
        }
      };
      return query;
    }
  };
  const repository = new ConversationRepository(client);
  const states = await repository.getReadStates(['c1', 'c2'], 'me');
  assert.equal(states.ok, true);
  assert.equal(states.value[0].conversation_id, 'c1');
  const count = await repository.countUnreadMessages('c1', 'me', '2026-11-14T10:00:00Z');
  assert.equal(count.value, 4);
  const latest = await repository.getLatestMessage('c1');
  assert.equal(latest.value.id, 'm9');
  const marked = await repository.markRead({ user_id: 'me', conversation_id: 'c1', last_read_message_id: 'm9', last_read_at: '2026-11-14T11:00:00Z' });
  assert.equal(marked.ok, true);
  assert.deepEqual(calls[0].filters, [['eq', 'user_id', 'me'], ['in', 'conversation_id', ['c1', 'c2']]]);
  assert.ok(calls[1].filters.some(filter => filter[0] === 'neq' && filter[1] === 'sender_id'));
  assert.ok(calls[1].filters.some(filter => filter[0] === 'gt' && filter[1] === 'created_at'));
  assert.deepEqual(calls[3].upsertOptions, { onConflict: 'user_id,conversation_id' });
});

test('listForUser reads membership ids then conversation rows in batches', async () => {
  const calls = [];
  const client = {
    from(table) {
      const state = { table, filters: [], inFilters: [], orders: [] };
      return {
        select(columns) { state.columns = columns; return this; },
        eq(column, value) { state.filters.push([column, value]); return this; },
        in(column, values) { state.inFilters.push([column, values]); return this; },
        order(column, options) { state.orders.push([column, options]); return this; },
        then(resolve, reject) {
          calls.push(state);
          if (table === 'channel_members' || table === 'channels') {
            return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          }
          if (table === 'conversation_members') {
            return Promise.resolve({
              data: [{ conversation_id: 'c2' }, { conversation_id: 'c1' }, { conversation_id: 'c1' }],
              error: null
            }).then(resolve, reject);
          }
          if (table === 'conversations') {
            return Promise.resolve({
              data: [
                { id: 'c1', type: 'direct', title: null, created_at: '2026-01-01' },
                { id: 'c2', type: 'group', title: 'G', created_at: '2026-02-01' }
              ],
              error: null
            }).then(resolve, reject);
          }
          return Promise.resolve({ data: null, error: new Error('unexpected ' + table) }).then(resolve, reject);
        }
      };
    }
  };
  const { ConversationRepository } = await import('../src/infrastructure/supabase/conversation-repository.js');
  const result = await new ConversationRepository(client).listForUser('user-1');
  assert.equal(result.ok, true);
  assert.equal(result.value[0].id, 'c2');
  assert.equal(result.value[1].id, 'c1');
  const members = calls.find(call => call.table === 'conversation_members');
  const conversations = calls.find(call => call.table === 'conversations');
  assert.ok(calls.some(call => call.table === 'channel_members'));
  assert.equal(members.columns, 'conversation_id');
  assert.deepEqual(members.filters, [['user_id', 'user-1']]);
  assert.match(conversations.columns, /id,type,title/);
});

test('listForUser returns empty list without conversation query when user has no memberships', async () => {
  const calls = [];
  const client = {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        then(resolve, reject) {
          calls.push(table);
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        }
      };
    }
  };
  const { ConversationRepository } = await import('../src/infrastructure/supabase/conversation-repository.js');
  const result = await new ConversationRepository(client).listForUser('user-1');
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, []);
  assert.deepEqual(calls.sort(), ['channel_members', 'channels', 'conversation_members']);
});

test('getAccessibleConversation verifies membership before loading the conversation', async () => {
  const calls = [];
  const client = {
    from(table) {
      const state = { table, filters: [] };
      const query = {
        select(columns) { state.columns = columns; return this; },
        eq(column, value) { state.filters.push([column, value]); return this; },
        maybeSingle() {
          calls.push(state);
          if (table === 'conversation_members') return Promise.resolve({ data: { conversation_id: 'c1' }, error: null });
          return Promise.resolve({ data: { id: 'c1', type: 'group', title: 'Research' }, error: null });
        }
      };
      return query;
    }
  };
  const result = await new ConversationRepository(client).getAccessibleConversation('c1', 'u1');
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: 'c1', type: 'group', title: 'Research' });
  assert.deepEqual(calls.map(call => call.table), ['conversation_members', 'conversations']);
  assert.deepEqual(calls[0].filters, [['conversation_id', 'c1'], ['user_id', 'u1']]);
  assert.equal(calls[1].columns, '*');
});

test('getAccessibleConversation fails closed without membership and never loads conversation data', async () => {
  const calls = [];
  const client = {
    from(table) {
      return {
        select(columns) { calls.push({ table, columns }); return this; },
        eq() { return this; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); }
      };
    }
  };
  const result = await new ConversationRepository(client).getAccessibleConversation('c1', 'u2');
  assert.equal(result.ok, false);
  assert.match(result.error.message, /нет доступа/i);
  assert.deepEqual(calls, [{ table: 'conversation_members', columns: 'conversation_id' }]);
});

test('getAccessibleConversation validates identifiers before touching Supabase', async () => {
  let calls = 0;
  const repository = new ConversationRepository({ from() { calls += 1; throw new Error('must not query'); } });
  const result = await repository.getAccessibleConversation('', 'u1');
  assert.equal(result.ok, false);
  assert.match(result.error.message, /requires both/i);
  assert.equal(calls, 0);
});


test('conversation list selects E2E metadata for secret and private group scopes', async () => {
  const calls = [];
  const client = { from(table) {
    const query = {
      select(columns) { calls.push({ table, columns }); return query; },
      eq() { return query; }, in() { return query; }, order() { return query; }, limit() { return query; },
      then(resolve, reject) { const data = table === 'conversation_members' ? [{ conversation_id: 'secret-1' }] : [{ id: 'secret-1', type: 'direct', is_secret: true, e2e_mode: 'required' }]; return Promise.resolve({ data, error: null }).then(resolve, reject); }
    };
    return query;
  } };
  const result = await new ConversationRepository(client).listForUser('user-a');
  assert.equal(result.ok, true);
  const selection = calls.find(call => call.table === 'conversations')?.columns || '';
  for (const field of ['is_secret', 'e2e_mode', 'e2e_epoch', 'e2e_protocol']) assert.match(selection, new RegExp(field));
});


test('listForUser projects channel membership and latest posts into chat-list entries', async () => {
  const source = await import('node:fs/promises');
  const code = await source.readFile(new URL('../src/infrastructure/supabase/conversation-repository.js', import.meta.url), 'utf8');
  assert.match(code, /from\('channel_members'\)/);
  assert.match(code, /from\('channels'\).*owner_id/s);
  assert.match(code, /from\('channel_posts'\)/);
  assert.match(code, /_rimEntityKind: 'channel'/);
});
