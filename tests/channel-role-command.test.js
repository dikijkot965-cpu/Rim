import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelCommandService } from '../src/application/channel-command-service.js';

test('setMemberRoleByUsername resolves profile and calls role RPC', async () => {
  const calls = [];
  const service = new ChannelCommandService({
    client: {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle() { return Promise.resolve({ data: { id: 'u2', username: 'bob' }, error: null }); }
        };
      },
      rpc: async (name, args) => { calls.push({ name, args }); return { data: true, error: null }; }
    },
    getUser: () => ({ id: 'u1' }),
    getChannel: () => ({ id: 'c1' }),
    reopenSettings: async () => calls.push('settings'),
    reloadDirectory: async () => {},
    reloadChannel: async () => {}
  });
  const result = await service.setMemberRoleByUsername({ username: '@bob', role: 'moderator' });
  assert.equal(result.ok, true);
  assert.equal(calls[0].name, 'rim_channel_set_member_role');
  assert.equal(calls[0].args.p_user_id, 'u2');
  assert.ok(calls.includes('settings'));
});
