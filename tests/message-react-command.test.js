import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageCommandService } from '../src/application/message-command-service.js';
import { Ok, Err } from '../src/core/result.js';

test('react rejects messages outside active conversation', async () => {
  const service = new MessageCommandService({
    repository: { react: async () => Ok(true) },
    storage: null,
    getUser: () => ({ id: 'u1' }),
    getConversation: () => ({ id: 'c1' }),
    getMessages: () => [{ id: 'm9', conversation_id: 'other' }],
    notify: () => {},
    reload: async () => {}
  });
  const result = await service.react('m9', '👍');
  assert.equal(result.ok, false);
});

test('react upserts through repository for in-conversation message', async () => {
  const calls = [];
  const service = new MessageCommandService({
    repository: {
      react: async payload => { calls.push(payload); return Ok(true); }
    },
    storage: null,
    getUser: () => ({ id: 'u1' }),
    getConversation: () => ({ id: 'c1' }),
    getMessages: () => [{ id: 'm1', conversation_id: 'c1' }],
    notify: () => {},
    reload: async () => {}
  });
  const result = await service.react('m1', '❤️');
  assert.equal(result.ok, true);
  assert.equal(calls[0].emoji, '❤️');
  assert.equal(calls[0].userId, 'u1');
});
