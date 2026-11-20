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


test('recovery phrase generator creates 24 words with a valid checksum and saves only the server digest', async () => {
  const { webcrypto } = await import('node:crypto');
  const { validateRecoveryPhrase } = await import('../src/domain/recovery-phrase.js');
  const calls = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } }, error: null }) },
    functions: { invoke: async (name, options) => { calls.push({ name, options }); return { data: { saved: true }, error: null }; } }
  };
  const phrase = await new RecoveryCodesService({ client, cryptoRef: webcrypto }).issuePhrase();
  assert.equal(phrase.split(' ').length, 24);
  assert.equal(await validateRecoveryPhrase(phrase, webcrypto), true);
  assert.equal(calls[0].options.body.action, 'save_phrase');
  assert.equal(calls[0].options.body.phrase, phrase);
});

test('recovery phrase validation rejects a changed checksum before network access', async () => {
  const { webcrypto } = await import('node:crypto');
  const { createRecoveryPhrase } = await import('../src/domain/recovery-phrase.js');
  const client = { functions: { invoke: async () => { throw new Error('must not call'); } }, auth: { verifyOtp: async () => ({}) } };
  const phrase = await createRecoveryPhrase(webcrypto);
  const words = phrase.split(' ');
  words[23] = words[23] === 'amber' ? 'anchor' : 'amber';
  await assert.rejects(() => new RecoveryCodesService({ client, cryptoRef: webcrypto }).redeemPhrase(words.join(' ')), /Фраза неверна/);
});

test('creating a recovery phrase draft does not activate or send it to the server', async () => {
  const { webcrypto } = await import('node:crypto');
  const calls = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } }, error: null }) },
    functions: { invoke: async (...args) => { calls.push(args); return { data: { saved: true }, error: null }; } }
  };
  const service = new RecoveryCodesService({ client, cryptoRef: webcrypto });
  const phrase = await service.createPhraseDraft();
  assert.equal(phrase.split(' ').length, 24);
  assert.equal(calls.length, 0);
  await service.savePhrase(phrase);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].body.action, 'save_phrase');
});

test('12-word phrase generation and validation is supported without network calls', async () => {
  const { webcrypto } = await import('node:crypto');
  const { createRecoveryPhrase, validateRecoveryPhrase, RECOVERY_WORDS_12 } = await import('../src/domain/recovery-phrase.js');
  const phrase = await createRecoveryPhrase(webcrypto, 12);
  assert.equal(RECOVERY_WORDS_12.length, 2048);
  assert.equal(phrase.split(' ').length, 12);
  assert.equal(await validateRecoveryPhrase(phrase, webcrypto), true);
  const words = phrase.split(' ');
  words[0] = words[0] === RECOVERY_WORDS_12[0] ? RECOVERY_WORDS_12[1] : RECOVERY_WORDS_12[0];
  assert.equal(await validateRecoveryPhrase(words.join(' '), webcrypto), false);
});

test('12-word phrases can be saved, used for seed login, and redeemed', async () => {
  const { webcrypto } = await import('node:crypto');
  const { createRecoveryPhrase } = await import('../src/domain/recovery-phrase.js');
  const calls = [];
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'jwt' } }, error: null }),
      setSession: async () => ({ data: { user: { id: 'u1' } }, error: null }),
      verifyOtp: async () => ({ data: { user: { id: 'u1' }, session: { access_token: 's' } }, error: null })
    },
    functions: { invoke: async (_name, options) => {
      calls.push(options.body);
      if (options.body.action === 'seed_login') return { data: { access_token: 'a', refresh_token: 'r' }, error: null };
      if (options.body.action === 'redeem_phrase') return { data: { token_hash: 'h' }, error: null };
      return { data: { saved: true }, error: null };
    } }
  };
  const service = new RecoveryCodesService({ client, cryptoRef: webcrypto });
  const phrase = await createRecoveryPhrase(webcrypto, 12);
  await service.savePhrase(phrase);
  await service.seedLogin(phrase);
  await service.redeemPhrase(phrase);
  assert.deepEqual(calls.map(call => call.action), ['save_phrase', 'seed_login', 'redeem_phrase']);
});
