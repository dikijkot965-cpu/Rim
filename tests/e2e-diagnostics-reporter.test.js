import test from 'node:test';
import assert from 'node:assert/strict';
import { E2EDiagnosticsReporter } from '../src/security/e2e/e2e-diagnostics-reporter.js';

test('automatic E2E diagnostics persist only bounded operational metadata', async () => {
  let inserted;
  const client = { from(table) { assert.equal(table, 'rim_e2e_diagnostics'); return { insert: async row => { inserted = row; return { error: null }; } }; } };
  const reporter = new E2EDiagnosticsReporter({ client, getUser: () => ({ id: 'user-1' }), now: () => 10000 });
  assert.equal(await reporter.record('runtime_ready', { status: 'success', conversationId: 'conv-1', metadata: { protocolReady: true, body: 'must-not-be-stored', state: 'relay-connected' } }), true);
  assert.equal(inserted.user_id, 'user-1');
  assert.equal(inserted.event, 'runtime_ready');
  assert.equal(inserted.status, 'ok');
  assert.equal(inserted.conversation_id, 'conv-1');
  assert.deepEqual(inserted.metadata, { protocolReady: true, state: 'relay-connected' });
  assert.equal('body' in inserted.metadata, false);
});

test('diagnostics do not write without an authenticated user', async () => {
  const reporter = new E2EDiagnosticsReporter({ client: { from() { throw new Error('should not run'); } }, getUser: () => null });
  assert.equal(await reporter.record('runtime_ready'), false);
});

test('admin diagnostics reader uses a bounded newest-first query', async () => {
  const calls = [];
  const rows = [{ id: 1, event: 'runtime_ready' }];
  const query = {
    select(fields) { calls.push(['select', fields]); return query; },
    order(column, options) { calls.push(['order', column, options]); return query; },
    limit(value) { calls.push(['limit', value]); return Promise.resolve({ data: rows, error: null }); }
  };
  const reporter = new E2EDiagnosticsReporter({ client: { from(table) { calls.push(['from', table]); return query; } }, getUser: () => ({ id: 'admin-1' }) });
  assert.deepEqual(await reporter.listRecent({ limit: 999 }), rows);
  assert.deepEqual(calls.find(call => call[0] === 'order'), ['order', 'created_at', { ascending: false }]);
  assert.deepEqual(calls.find(call => call[0] === 'limit'), ['limit', 250]);
});
