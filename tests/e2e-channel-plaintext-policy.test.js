import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChannelPlaintextGate } from '../src/application/channel-plaintext-policy.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

function harness({ channel = { id: 'private-1', is_public: false }, user = { id: 'user-1' }, result = { ok: true, value: { enabled: false } }, beforeResolve = null } = {}) {
  const state = { channel, user, calls: [], notices: [], warnings: [] };
  const gate = createChannelPlaintextGate({
    getUser: () => state.user,
    getChannel: () => state.channel,
    e2eScopeRepository: { async getScope(scope, userId) { state.calls.push({ scope, userId }); await beforeResolve?.(state); return result; } },
    notify: message => state.notices.push(message),
    logger: { warn: (...args) => state.warnings.push(args) }
  });
  return { state, gate };
}

test('private channel with E2E off permits existing plaintext feature', async () => {
  const h = harness();
  assert.equal(await h.gate('comment'), true);
  assert.equal(h.state.calls.length, 1);
  assert.equal(h.state.calls[0].scope.type, 'private_channel');
});

test('private E2E-required channel blocks plaintext polls, votes and comments', async () => {
  for (const operation of ['comment', 'create-poll', 'poll-vote']) {
    const h = harness({ result: { ok: true, value: { enabled: true } } });
    assert.equal(await h.gate(operation), false);
    assert.match(h.state.notices.at(-1), /требуется E2E/i);
  }
});

test('scope lookup errors and thrown failures fail closed', async () => {
  const failed = harness({ result: { ok: false, error: new Error('offline') } });
  assert.equal(await failed.gate('comment'), false);
  const thrown = harness({ beforeResolve: async () => { throw new Error('offline'); } });
  assert.equal(await thrown.gate('poll-vote'), false);
  assert.equal(thrown.state.warnings.length, 1);
});

test('public channels preserve legacy behavior without E2E lookup', async () => {
  const h = harness({ channel: { id: 'public-1', is_public: true } });
  assert.equal(await h.gate('create-poll'), true);
  assert.equal(h.state.calls.length, 0);
});

test('unknown channel privacy and missing repository fail closed', async () => {
  const unknown = harness({ channel: { id: 'unknown' } });
  assert.equal(await unknown.gate('comment'), false);
  const noRepo = createChannelPlaintextGate({ getUser: () => ({ id: 'u' }), getChannel: () => ({ id: 'p', is_public: false }) });
  assert.equal(await noRepo('comment'), false);
});

test('account or channel switch during scope lookup cancels the operation', async () => {
  const account = harness({ beforeResolve: async state => { state.user = { id: 'user-2' }; } });
  assert.equal(await account.gate('comment'), false);
  const channel = harness({ beforeResolve: async state => { state.channel = { id: 'private-2', is_public: false }; } });
  assert.equal(await channel.gate('poll-vote'), false);
});

test('legacy poll and comment mutations call the shared E2E plaintext gate', () => {
  const legacy = readFileSync(join(root, 'assets/js/legacy/19-rim-update-channels.js'), 'utf8');
  const older = readFileSync(join(root, 'assets/js/legacy/03-legacy-03.js'), 'utf8');
  assert.match(legacy, /__rimCanPerformPlaintextChannelOperation\('comment'/);
  assert.match(legacy, /__rimCanPerformPlaintextChannelOperation\('create-poll'/);
  assert.match(legacy, /__rimCanPerformPlaintextChannelOperation\('poll-vote'/);
  assert.match(older, /__rimCanPerformPlaintextChannelOperation\('comment'/);
});

test('Iteration 154 SQL blocks direct plaintext writes and activation with legacy content', () => {
  const sql = readFileSync(join(root, 'supabase/migrations/20261122100000_rim_iteration_154_e2e_channel_plaintext_guard.sql'), 'utf8');
  for (const table of ['channel_posts', 'channel_polls', 'channel_post_comments', 'channel_poll_votes', 'channel_reactions']) {
    assert.match(sql, new RegExp(`on public\\.${table}\\s+for each row execute function private\\.rim_guard_e2e_channel_plaintext_write`, 'i'));
  }
  assert.match(sql, /e2e_channel_has_legacy_plaintext_content/);
  assert.match(sql, /new\.encryption_version is distinct from 1/);
  assert.match(sql, /new\.encrypted_payload is null/);
  assert.match(sql, /channel_scheduled_posts/);
  assert.equal((sql.match(/pg_advisory_xact_lock\(pg_catalog\.hashtextextended/g) || []).length, 2);
});
