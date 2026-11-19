import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelCommandService } from '../src/application/channel-command-service.js';

test('join calls rim_channel_join and reloads directory', async () => {
  const calls = [];
  const service = new ChannelCommandService({
    client: {
      rpc: async (name, args) => { calls.push({ name, args }); return { error: null }; }
    },
    getUser: () => ({ id: 'u1' }),
    reloadDirectory: async () => { calls.push('dir'); },
    reloadChannel: async id => { calls.push(['ch', id]); },
    reopenSettings: async () => {}
  });
  const result = await service.join('c1');
  assert.equal(result.ok, true);
  assert.equal(calls[0].name, 'rim_channel_join');
  assert.equal(calls[0].args.p_channel_id, 'c1');
  assert.ok(calls.includes('dir'));
});

test('leave can cancel without RPC', async () => {
  const calls = [];
  const service = new ChannelCommandService({
    client: { rpc: async (...a) => { calls.push(a); return { error: null }; } },
    getUser: () => ({ id: 'u1' }),
    confirm: () => false,
    reloadDirectory: async () => {},
    reloadChannel: async () => {},
    reopenSettings: async () => {}
  });
  const result = await service.leave('c1');
  assert.equal(result.ok, true);
  assert.equal(result.value.cancelled, true);
  assert.equal(calls.length, 0);
});

test('moderate mute validates hours', async () => {
  const service = new ChannelCommandService({
    client: { rpc: async () => ({ error: null }) },
    getUser: () => ({ id: 'u1' }),
    prompt: () => '99999',
    confirm: () => true,
    reloadDirectory: async () => {},
    reloadChannel: async () => {},
    reopenSettings: async () => {}
  });
  const result = await service.moderate('c1', 'u2', 'mute');
  assert.equal(result.ok, false);
});

test('moderate ban calls RPC with action ban', async () => {
  const calls = [];
  const service = new ChannelCommandService({
    client: {
      rpc: async (name, args) => { calls.push({ name, args }); return { error: null }; }
    },
    getUser: () => ({ id: 'u1' }),
    confirm: () => true,
    prompt: () => 'spam',
    reloadDirectory: async () => {},
    reloadChannel: async () => {},
    reopenSettings: async () => { calls.push('settings'); }
  });
  const result = await service.moderate('c1', 'u2', 'ban');
  assert.equal(result.ok, true);
  assert.equal(calls[0].args.p_action, 'ban');
  assert.ok(calls.includes('settings'));
});
