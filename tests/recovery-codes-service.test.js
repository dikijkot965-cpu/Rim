import test from 'node:test';
import assert from 'node:assert/strict';
import { RecoveryCodesService } from '../src/application/recovery-codes-service.js';

test('issue recovery codes requires an authenticated session and returns ten codes', async () => {
  const calls = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } }, error: null }) },
    functions: { invoke: async (...args) => { calls.push(args); return { data: { codes: Array.from({ length: 10 }, (_, i) => `CODE-${i}`) }, error: null }; } }
  };
  const service = new RecoveryCodesService({ client });
  const codes = await service.issue();
  assert.equal(codes.length, 10);
  assert.equal(calls[0][0], 'rim-account-security');
  assert.equal(calls[0][1].body.action, 'issue');
});

test('issue recovery codes fails closed without an active session', async () => {
  const client = { auth: { getSession: async () => ({ data: { session: null }, error: null }) }, functions: { invoke: async () => { throw new Error('must not call'); } } };
  await assert.rejects(() => new RecoveryCodesService({ client }).issue(), /необходимо войти/i);
});

test('redeem exchanges a one-time code for a Supabase magic-link session', async () => {
  const calls = [];
  const user = { id: 'user-1' };
  const client = {
    functions: { invoke: async (...args) => { calls.push(args); return { data: { token_hash: 'one-time-hash' }, error: null }; } },
    auth: { verifyOtp: async args => ({ data: { user, session: { access_token: 'session' } }, error: null }) }
  };
  const result = await new RecoveryCodesService({ client }).redeem('ABCD-EF01-2345-6789-ABCD-EF01-2345-6789');
  assert.equal(result, user);
  assert.equal(calls[0][1].body.action, 'redeem');
});

test('redeem rejects malformed codes before contacting the server', async () => {
  const client = { functions: { invoke: async () => { throw new Error('must not call'); } }, auth: { verifyOtp: async () => ({}) } };
  await assert.rejects(() => new RecoveryCodesService({ client }).redeem('not-a-code'), /действительный код/i);
});
