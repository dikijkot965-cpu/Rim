import test from 'node:test';
import assert from 'node:assert/strict';
import { GroupRepository } from '../src/infrastructure/supabase/group-repository.js';

function createClient({
  group = null,
  members = [],
  profiles = [],
  failTable = null
} = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const state = { table, filters: [], orders: [], inFilters: [] };
      const query = {
        select(columns) { state.columns = columns; return this; },
        eq(column, value) { state.filters.push([column, value]); return this; },
        in(column, values) { state.inFilters.push([column, values]); return this; },
        order(column, options) { state.orders.push([column, options]); return this; },
        single() {
          state.single = true;
          return this;
        },
        then(resolve, reject) {
          calls.push(state);
          if (table === failTable) {
            return Promise.resolve({ data: null, error: new Error(`${table} failed`) }).then(resolve, reject);
          }
          if (table === 'conversations') {
            return Promise.resolve({ data: group, error: null }).then(resolve, reject);
          }
          if (table === 'conversation_members') {
            return Promise.resolve({ data: members, error: null }).then(resolve, reject);
          }
          if (table === 'profiles') {
            return Promise.resolve({ data: profiles, error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: null, error: new Error(`unexpected table ${table}`) }).then(resolve, reject);
        }
      };
      return query;
    }
  };
}

test('group settings projection loads group, members and profiles with narrow columns', async () => {
  const client = createClient({
    group: {
      id: 'g1',
      title: 'Staff',
      description: 'Internal',
      is_private: true,
      created_by: 'owner-1',
      invite_code: 'ABC',
      avatar_path: null,
      type: 'group'
    },
    members: [
      { user_id: 'owner-1', role: 'owner', joined_at: '2026-01-01' },
      { user_id: 'admin-2', role: 'admin', joined_at: '2026-01-02' }
    ],
    profiles: [
      { id: 'owner-1', username: 'tsar', display_name: 'Император' },
      { id: 'admin-2', username: 'aide', display_name: 'Помощник' }
    ]
  });

  const result = await new GroupRepository(client).getSettingsProjection('g1', 'owner-1');
  assert.equal(result.ok, true);
  assert.equal(result.value.group.id, 'g1');
  assert.equal(result.value.members.length, 2);
  assert.equal(result.value.profileById['owner-1'].username, 'tsar');
  assert.equal(result.value.isManager, true);
  assert.equal(result.value.isCreator, true);

  const groupCall = client.calls.find(call => call.table === 'conversations');
  const membersCall = client.calls.find(call => call.table === 'conversation_members');
  const profilesCall = client.calls.find(call => call.table === 'profiles');

  assert.equal(groupCall.columns, 'id,title,description,is_private,created_by,invite_code,avatar_path,type,e2e_mode,e2e_epoch,e2e_protocol');
  assert.deepEqual(groupCall.filters, [['id', 'g1']]);
  assert.equal(groupCall.single, true);

  assert.equal(membersCall.columns, 'user_id,role,joined_at');
  assert.deepEqual(membersCall.filters, [['conversation_id', 'g1']]);
  assert.deepEqual(membersCall.orders, [['joined_at', { ascending: true }]]);

  assert.equal(profilesCall.columns, 'id,username,display_name');
  assert.deepEqual(profilesCall.inFilters, [['id', ['owner-1', 'admin-2']]]);
});

test('group settings marks non-managers correctly', async () => {
  const client = createClient({
    group: {
      id: 'g1',
      title: 'Staff',
      description: '',
      is_private: false,
      created_by: 'owner-1',
      invite_code: null,
      avatar_path: null,
      type: 'group'
    },
    members: [
      { user_id: 'owner-1', role: 'owner', joined_at: '2026-01-01' },
      { user_id: 'member-9', role: 'member', joined_at: '2026-01-03' }
    ],
    profiles: [
      { id: 'owner-1', username: 'tsar', display_name: 'Император' },
      { id: 'member-9', username: 'soldier', display_name: 'Солдат' }
    ]
  });

  const result = await new GroupRepository(client).getSettingsProjection('g1', 'member-9');
  assert.equal(result.ok, true);
  assert.equal(result.value.isManager, false);
  assert.equal(result.value.isCreator, false);
  assert.equal(result.value.ownMembership.role, 'member');
});

test('group settings rejects missing conversation id or user', async () => {
  const client = createClient();
  const missingId = await new GroupRepository(client).getSettingsProjection('', 'u1');
  const missingUser = await new GroupRepository(client).getSettingsProjection('g1', null);
  assert.equal(missingId.ok, false);
  assert.equal(missingUser.ok, false);
  assert.equal(client.calls.length, 0);
});

test('group settings rejects non-group conversations', async () => {
  const client = createClient({
    group: {
      id: 'dm1',
      title: 'DM',
      type: 'direct',
      created_by: 'u1',
      is_private: true
    },
    members: []
  });
  const result = await new GroupRepository(client).getSettingsProjection('dm1', 'u1');
  assert.equal(result.ok, false);
  assert.match(String(result.error.message), /Группа не найдена/);
});

test('group settings propagates query failures', async () => {
  const client = createClient({ failTable: 'conversations' });
  const result = await new GroupRepository(client).getSettingsProjection('g1', 'u1');
  assert.equal(result.ok, false);
  assert.match(String(result.error.message), /conversations failed/);
});
