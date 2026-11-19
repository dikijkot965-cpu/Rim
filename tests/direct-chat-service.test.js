import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectChatService } from '../src/application/direct-chat-service.js';

test('findByUsername returns not found', async () => {
  const service = new DirectChatService({
    client: {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: null, error: null })
        };
      }
    },
    getUser: () => ({ id: 'u1' })
  });
  const result = await service.findByUsername('ghost');
  assert.equal(result.ok, false);
});

test('startWith rejects self-chat and calls RPC', async () => {
  const calls = [];
  const service = new DirectChatService({
    client: {
      rpc: async (name, args) => { calls.push({ name, args }); return { data: 'c1', error: null }; }
    },
    getUser: () => ({ id: 'u1' }),
    reloadConversations: async () => calls.push('reload'),
    openConversation: async id => calls.push(['open', id])
  });
  assert.equal((await service.startWith('u1')).ok, false);
  const ok = await service.startWith('u2');
  assert.equal(ok.ok, true);
  assert.equal(calls[0].name, 'start_direct_chat');
  assert.deepEqual(calls.slice(1), ['reload', ['open', 'c1']]);
});
