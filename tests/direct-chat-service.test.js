import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectChatService } from '../src/application/direct-chat-service.js';

test('startSecretWith creates a dedicated E2E secret conversation and opens it', async () => {
  const calls = [];
  const service = new DirectChatService({
    client: { rpc: async (name, args) => { calls.push({ name, args }); return { data: 'secret-c1', error: null }; } },
    getUser: () => ({ id: 'user-a' }),
    reloadConversations: async () => calls.push('reload'),
    openConversation: async id => calls.push(['open', id])
  });
  assert.equal((await service.startSecretWith('user-a')).ok, false);
  const result = await service.startSecretWith('user-b');
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    { name: 'rim_create_secret_direct_chat', args: { p_other_user: 'user-b' } },
    'reload', ['open', 'secret-c1']
  ]);
});
