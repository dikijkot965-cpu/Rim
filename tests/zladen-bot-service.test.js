import test from 'node:test';
import assert from 'node:assert/strict';
import { ZladenBotService } from '../src/application/zladen-bot-service.js';

function mockClient(response = { data: { ok: true, result: { installed: true, conversation_id: 'c1' } }, error: null }) {
  const calls = [];
  return { calls, functions: { invoke: async (...args) => { calls.push(args); return response; } } };
}

test('ZladenBotService installs through the server function and requires a signed-in user', async () => {
  const client = mockClient();
  const service = new ZladenBotService({ client, getUser: () => ({ id: 'u1' }) });
  const result = await service.install();
  assert.equal(result.ok, true);
  assert.equal(client.calls[0][0], 'rim-zladen');
  assert.equal(client.calls[0][1].body.action, 'install');
});

test('ZladenBotService rejects invalid state and maps server errors', async () => {
  const client = mockClient({ data: { error: 'owner_only' }, error: null });
  const service = new ZladenBotService({ client, getUser: () => ({ id: 'u1' }) });
  assert.equal((await service.setState('banish')).ok, false);
  const result = await service.updateOwnerProfile({ display_name: 'Злыдя' });
  assert.equal(result.ok, false);
  assert.match(result.error.message, /owner_only/);
});

test('ZladenBotService coalesces simultaneous install requests', async () => {
  let count = 0;
  const client = { functions: { invoke: async () => { count++; await new Promise(resolve => setTimeout(resolve, 5)); return { data: { ok: true, result: { installed: true } }, error: null }; } } };
  const service = new ZladenBotService({ client, getUser: () => ({ id: 'u1' }) });
  const [a,b] = await Promise.all([service.install(), service.install()]);
  assert.equal(a.ok && b.ok, true);
  assert.equal(count, 1);
});

test('ZladenBotService exposes a minimal public bot profile for group invitations', async () => {
  const client = mockClient({ data: { ok: true, result: { username: 'zladen_bot', display_name: 'Злыдя' } }, error: null });
  const service = new ZladenBotService({ client, getUser: () => ({ id: 'u1' }) });
  const result = await service.getPublicProfile();
  assert.equal(result.ok, true);
  assert.equal(result.value.username, 'zladen_bot');
  assert.equal(client.calls[0][1].body.action, 'public_profile');
});
