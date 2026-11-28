import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageCommandService } from '../src/application/message-command-service.js';
import { E2EScopeRepository } from '../src/infrastructure/supabase/e2e-scope-repository.js';

test('pending secret direct chat is not treated as an ordinary plaintext conversation', async () => {
  const client = {
    from() {
      const query = {
        select() { return query; },
        eq() { return query; },
        maybeSingle: async () => ({
          data: { id: 'direct-pending', type: 'direct', is_secret: false, e2e_mode: 'pending', e2e_epoch: 1 },
          error: null
        })
      };
      return query;
    }
  };
  const scopes = new E2EScopeRepository(client);
  const scope = await scopes.getScope({ type: 'direct', id: 'direct-pending' }, 'user-a');
  assert.equal(scope.ok, true);
  assert.equal(scope.value.enabled, false);
  assert.equal(scope.value.pendingSecretRequest, true);
  assert.equal(scope.value.plaintextBlocked, true);

  let inserts = 0;
  const service = new MessageCommandService({
    repository: { insert: async () => { inserts++; return { ok: true, value: { id: 'm1' } }; } },
    getUser: () => ({ id: 'user-a' }),
    getConversation: () => ({ id: 'direct-pending', type: 'direct', is_secret: false, e2e_mode: 'pending' }),
    e2eScopeRepository: scopes
  });
  const result = await service.sendText('не должно уйти открытым текстом');
  assert.equal(result.ok, false);
  assert.match(result.error.message, /ожидает принятия приглашения/i);
  assert.equal(inserts, 0);
  const queued = await service.canQueuePlaintextOutbox(
    { id: 'direct-pending', type: 'direct', is_secret: false, e2e_mode: 'pending' },
    { id: 'user-a' }
  );
  assert.equal(queued.ok, false);
  assert.match(queued.error.message, /ожидает принятия приглашения/i);
});
