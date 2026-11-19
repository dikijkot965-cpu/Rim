import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelCommandService } from '../src/application/channel-command-service.js';

test('saveSettings validates title and username', async () => {
  const service = new ChannelCommandService({
    client: { from() { return this; }, update() { return this; }, eq() { return this; }, select() { return this; }, single() { return Promise.resolve({ data: null, error: null }); }, rpc: async () => ({ error: null }) },
    getUser: () => ({ id: 'u1' }),
    getChannel: () => ({ id: 'c1' }),
    setChannel: () => {},
    reloadDirectory: async () => {},
    reloadChannel: async () => {},
    reopenSettings: async () => {}
  });
  assert.equal((await service.saveSettings({ title: '' })).ok, false);
  assert.equal((await service.saveSettings({ title: 'Ok', username: 'A' })).ok, false);
});

test('saveSettings updates channel and discussion rpc', async () => {
  const calls = [];
  const service = new ChannelCommandService({
    client: {
      from(table) {
        calls.push(['from', table]);
        return {
          update(payload) { calls.push(['update', payload]); return this; },
          eq() { return this; },
          select() { return this; },
          single() { return Promise.resolve({ data: { id: 'c1', title: 'News' }, error: null }); }
        };
      },
      rpc: async (name, args) => { calls.push(['rpc', name, args]); return { error: null }; }
    },
    getUser: () => ({ id: 'u1' }),
    getChannel: () => ({ id: 'c1' }),
    setChannel: channel => calls.push(['set', channel.title]),
    reloadDirectory: async () => {},
    reloadChannel: async id => calls.push(['reload', id]),
    reopenSettings: async () => {}
  });
  const result = await service.saveSettings({
    title: 'News',
    description: 'd',
    username: 'news_channel',
    isPublic: true,
    discussionConversationId: 'g1'
  });
  assert.equal(result.ok, true);
  assert.ok(calls.some(call => call[0] === 'rpc' && call[1] === 'rim_set_channel_discussion'));
  assert.ok(calls.some(call => call[0] === 'reload' && call[1] === 'c1'));
});

test('createInvite validates max uses', async () => {
  const service = new ChannelCommandService({
    client: { rpc: async () => ({ data: [{ code: 'X' }], error: null }) },
    getUser: () => ({ id: 'u1' }),
    getChannel: () => ({ id: 'c1' }),
    prompt: () => '0',
    reloadDirectory: async () => {},
    reloadChannel: async () => {},
    reopenSettings: async () => {}
  });
  const result = await service.createInvite();
  assert.equal(result.ok, false);
});
