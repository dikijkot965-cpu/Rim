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

test('create rolls back channel and avatar when owner membership fails', async () => {
  const calls = [];
  const membershipError = new Error('membership denied');
  const service = new ChannelCommandService({
    client: {
      storage: { from: () => ({
        upload: async () => ({ error: null }),
        remove: async paths => { calls.push(['remove-avatar', paths]); return { error: null }; }
      }) },
      from(table) {
        return {
          insert(payload) {
            calls.push(['insert', table, payload]);
            return { select: () => ({ single: async () => ({ data: { id: 'ch-failed', title: payload.title }, error: null }) }) };
          },
          upsert(payload) {
            calls.push(['upsert', table, payload]);
            return Promise.resolve({ error: membershipError });
          },
          delete() {
            return { eq: async (column, value) => { calls.push(['rollback', table, column, value]); return { error: null }; } };
          }
        };
      }
    },
    getUser: () => ({ id: 'u1' }),
    closeModal: () => calls.push(['close']),
    reloadDirectory: async () => calls.push(['reload']),
    reloadChannel: async id => calls.push(['open', id])
  });
  const result = await service.create({
    title: 'Закрытый канал',
    isPublic: false,
    avatarFile: { size: 10, type: 'image/png', name: 'avatar.png' }
  });
  assert.equal(result.ok, false);
  assert.match(result.error.message, /не удалось назначить владельца/i);
  assert.ok(calls.some(call => call[0] === 'rollback' && call[1] === 'channels' && call[3] === 'ch-failed'));
  assert.ok(calls.some(call => call[0] === 'remove-avatar'));
  assert.equal(calls.some(call => ['reload', 'open', 'close'].includes(call[0])), false);
});
