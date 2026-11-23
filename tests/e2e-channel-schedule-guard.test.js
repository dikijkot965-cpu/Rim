import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ChannelFeedController } from '../src/application/channel-feed-controller.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function harness({ isPublic = false, scopeResult = { ok: true, value: { enabled: false } } } = {}) {
  const state = { user: { id: 'u1' }, calls: [], notices: [] };
  const channel = { id: 'c1', is_public: isPublic };
  const controller = new ChannelFeedController({
    repository: {
      async schedulePost(...args) { state.calls.push(['schedule', ...args]); return { ok: true, value: { id: 'scheduled-new' } }; },
      async cancelScheduledPost(...args) { state.calls.push(['cancel', ...args]); return { ok: true, value: true }; },
      async getScheduledPosts() { return { ok: true, value: [] }; },
      async publishScheduledPost(...args) { state.calls.push(['publish', ...args]); return { ok: true, value: {} }; }
    },
    getUser: () => state.user,
    e2eScopeRepository: { getScope: async (...args) => { state.calls.push(['scope', ...args]); return scopeResult; } },
    notify: message => state.notices.push(message),
    windowRef: {}, documentRef: {}
  });
  controller.feedState = { manager: true, channel, scheduledLoaded: false, scheduledPosts: [] };
  controller._testState = state;
  return { controller, state };
}

test('required E2E private channel blocks scheduling before repository write', async () => {
  const h = harness({ scopeResult: { ok: true, value: { enabled: true } } });
  const original = globalThis.FormData;
  globalThis.FormData = class { constructor() {} get(name) { return name === 'body' ? 'secret' : '2030-01-01T10:00'; } };
  try { await h.controller.scheduleFromForm({ reset() {} }); } finally { globalThis.FormData = original; }
  assert.equal(h.state.calls.filter(call => call[0] === 'schedule').length, 0);
  assert.match(h.state.notices.at(-1), /требуется E2E/i);
});

test('scope lookup failure blocks scheduled publish', async () => {
  const h = harness({ scopeResult: { ok: false, error: new Error('offline') } });
  await h.controller.publishScheduledPost('scheduled-1');
  assert.equal(h.state.calls.filter(call => call[0] === 'publish').length, 0);
  assert.match(h.state.notices.at(-1), /проверить режим защиты/i);
});

test('public channels retain schedule and publish paths without private E2E lookup', async () => {
  const h = harness({ isPublic: true });
  const original = globalThis.FormData;
  globalThis.FormData = class { constructor() {} get(name) { return name === 'body' ? 'public text' : '2030-01-01T10:00'; } };
  try { await h.controller.scheduleFromForm({ reset() {} }); } finally { globalThis.FormData = original; }
  await h.controller.publishScheduledPost('scheduled-2');
  assert.equal(h.state.calls.filter(call => call[0] === 'scope').length, 0);
  assert.equal(h.state.calls.filter(call => call[0] === 'schedule').length, 1);
  assert.equal(h.state.calls.filter(call => call[0] === 'publish').length, 1);
});

test('SQL migration blocks plaintext scheduled posts and E2E activation with queued plaintext', () => {
  const sql = readFileSync(join(root, 'supabase/migrations/20261122090000_rim_iteration_153_e2e_channel_schedule_guard.sql'), 'utf8');
  assert.match(sql, /before insert or update of channel_id,body,media_paths on public\.channel_scheduled_posts/i);
  assert.match(sql, /e2e_required_plaintext_channel_schedule_rejected/);
  assert.match(sql, /before update of e2e_mode on public\.channels/i);
  assert.match(sql, /e2e_channel_has_plaintext_scheduled_posts/);
});


test('account switch during private-channel scope preflight prevents schedule write', async () => {
  const h = harness();
  h.controller.e2eScopeRepository.getScope = async () => {
    h.state.user = { id: 'u2' };
    return { ok: true, value: { enabled: false } };
  };
  const original = globalThis.FormData;
  globalThis.FormData = class { constructor() {} get(name) { return name === 'body' ? 'secret' : '2030-01-01T10:00'; } };
  try { await h.controller.scheduleFromForm({ reset() {} }); } finally { globalThis.FormData = original; }
  assert.equal(h.state.calls.filter(call => call[0] === 'schedule').length, 0);
});

test('account switch during schedule insert best-effort cancels stale scheduled row', async () => {
  const h = harness();
  h.controller.repository.schedulePost = async (...args) => {
    h.state.calls.push(['schedule', ...args]);
    h.state.user = { id: 'u2' };
    return { ok: true, value: { id: 'scheduled-new' } };
  };
  const original = globalThis.FormData;
  globalThis.FormData = class { constructor() {} get(name) { return name === 'body' ? 'secret' : '2030-01-01T10:00'; } };
  try { await h.controller.scheduleFromForm({ reset() {} }); } finally { globalThis.FormData = original; }
  assert.equal(h.state.calls.filter(call => call[0] === 'cancel').length, 1);
  assert.match(h.state.notices.at(-1), /планирование отменено/i);
});
