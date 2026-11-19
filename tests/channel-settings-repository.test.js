import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelSettingsRepository } from '../src/infrastructure/supabase/channel-settings-repository.js';

function createClient({ membership = null, members = [], profiles = [], groups = [], moderation = [], fail = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const state = { table, filters: [], inFilters: [], orders: [] };
      const query = {
        select(columns) { state.columns = columns; return this; },
        eq(column, value) { state.filters.push([column, value]); return this; },
        in(column, values) { state.inFilters.push([column, values]); return this; },
        order(column, options) { state.orders.push([column, options]); return this; },
        limit(value) { state.limit = value; return this; },
        maybeSingle() { state.maybeSingle = true; return this; },
        then(resolve, reject) {
          calls.push(state);
          if (fail === table) return Promise.resolve({ data: null, error: new Error(table + ' failed') }).then(resolve, reject);
          const data = table === 'channel_members' ? (state.maybeSingle ? membership : members)
            : table === 'profiles' ? profiles
              : table === 'conversations' ? groups
                : null;
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        }
      };
      return query;
    },
    rpc(name, args) {
      calls.push({ rpc: name, args });
      if (fail === 'rpc') return Promise.resolve({ data: null, error: new Error('rpc failed') });
      return Promise.resolve({ data: moderation, error: null });
    }
  };
}

test('owner can manage without membership lookup result role', async () => {
  const client = createClient();
  const result = await new ChannelSettingsRepository(client).canManage({ id: 'ch1', owner_id: 'u1' }, 'u1');
  assert.equal(result.ok, true);
  assert.equal(result.value, true);
  assert.equal(client.calls.length, 0);
});

test('admin membership grants manage rights', async () => {
  const client = createClient({ membership: { role: 'admin' } });
  const result = await new ChannelSettingsRepository(client).canManage({ id: 'ch1', owner_id: 'owner' }, 'u2');
  assert.equal(result.ok, true);
  assert.equal(result.value, true);
});

test('ancillary loads groups, members with profiles and moderation rpc', async () => {
  const client = createClient({
    members: [{ user_id: 'u1', role: 'member' }],
    profiles: [{ id: 'u1', username: 'a', display_name: 'A' }],
    groups: [{ id: 'g1', title: 'Group' }],
    moderation: [{ user_id: 'u9', action: 'mute', expires_at: null }]
  });
  const result = await new ChannelSettingsRepository(client).getAncillary('ch1');
  assert.equal(result.ok, true);
  assert.equal(result.value.members[0].profile.username, 'a');
  assert.equal(result.value.groups[0].id, 'g1');
  assert.equal(result.value.moderation[0].action, 'mute');
  assert.ok(client.calls.some(call => call.rpc === 'rim_channel_moderation_status'));
});
