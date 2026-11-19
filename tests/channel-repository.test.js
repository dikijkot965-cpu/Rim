import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelRepository } from '../src/infrastructure/supabase/channel-repository.js';

function createClient({ channels = [], memberships = [], failTable = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const state = { table, filters: [], orders: [] };
      const query = {
        select(columns) { state.columns = columns; return this; },
        order(column, options) { state.orders.push([column, options]); return this; },
        limit(value) { state.limit = value; return this; },
        eq(column, value) { state.filters.push([column, value]); return this; },
        then(resolve, reject) {
          calls.push(state);
          if (table === failTable) return Promise.resolve({ data: null, error: new Error(`${table} failed`) }).then(resolve, reject);
          const data = table === 'channels' ? channels : memberships;
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        }
      };
      return query;
    }
  };
}

test('channel directory reads newest channels and only the current user membership rows', async () => {
  const client = createClient({
    channels: [{ id: 'ch2' }, { id: 'ch1' }],
    memberships: [{ channel_id: 'ch1' }, { channel_id: 'ch1' }, { channel_id: null }]
  });
  const result = await new ChannelRepository(client).getDirectory('user-1');
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.channels, [{ id: 'ch2' }, { id: 'ch1' }]);
  assert.deepEqual(result.value.subscribedChannelIds, ['ch1']);
  const channels = client.calls.find(call => call.table === 'channels');
  const members = client.calls.find(call => call.table === 'channel_members');
  assert.equal(channels.columns, 'id,title,description,is_public,username');
  assert.deepEqual(channels.orders, [['created_at', { ascending: false }]]);
  assert.equal(channels.limit, 300);
  assert.equal(members.columns, 'channel_id');
  assert.deepEqual(members.filters, [['user_id', 'user-1']]);
});

test('channel directory clamps configured result limit', async () => {
  const client = createClient();
  await new ChannelRepository(client, { limit: 900 }).getDirectory('user-1');
  assert.equal(client.calls.find(call => call.table === 'channels').limit, 500);
});

test('channel directory does not query without an authenticated user', async () => {
  const client = createClient();
  const result = await new ChannelRepository(client).getDirectory(null);
  assert.equal(result.ok, false);
  assert.match(result.error.message, /authenticated user/);
  assert.equal(client.calls.length, 0);
});

test('channel directory returns the first query error without fabricating an empty result', async () => {
  const client = createClient({ failTable: 'channel_members' });
  const result = await new ChannelRepository(client).getDirectory('user-1');
  assert.equal(result.ok, false);
  assert.match(result.error.message, /channel_members failed/);
});
