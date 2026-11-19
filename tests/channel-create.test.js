import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelCommandService } from '../src/application/channel-command-service.js';

test('create validates title and username', async () => {
  const service = new ChannelCommandService({
    client: {},
    getUser: () => ({ id: 'u1' })
  });
  assert.equal((await service.create({ title: '' })).ok, false);
  assert.equal((await service.create({ title: 'News', username: '!!' })).ok, false);
});

test('create inserts channel and owner membership', async () => {
  const calls = [];
  const service = new ChannelCommandService({
    client: {
      storage: { from() { return { upload: async () => ({ error: null }), remove: async () => ({}) }; } },
      from(table) {
        return {
          insert(payload) {
            calls.push(['insert', table, payload]);
            if (table === 'channels') {
              return { select() { return { single: async () => ({ data: { id: 'ch1', title: payload.title }, error: null }) }; } };
            }
            return Promise.resolve({ error: null });
          },
          upsert(payload) {
            calls.push(['upsert', table, payload]);
            return Promise.resolve({ error: null });
          }
        };
      }
    },
    getUser: () => ({ id: 'u1' }),
    reloadDirectory: async () => calls.push('dir'),
    reloadChannel: async id => calls.push(['open', id]),
    closeModal: () => calls.push('close')
  });
  const result = await service.create({ title: 'Вести', description: 'd', isPublic: true });
  assert.equal(result.ok, true);
  assert.ok(calls.some(c => c[0] === 'insert' && c[1] === 'channels'));
  assert.ok(calls.some(c => c[0] === 'upsert' && c[1] === 'channel_members'));
});
