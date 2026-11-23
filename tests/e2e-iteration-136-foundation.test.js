import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase/migrations/20261121120000_rim_iteration_136_e2e_scope_foundation.sql', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('iteration 136 adds E2E fields without rewriting existing messages', () => {
  assert.match(migration, /add column if not exists encrypted_payload jsonb/i);
  assert.match(migration, /add column if not exists e2e_mode text not null default 'off'/i);
  assert.doesNotMatch(migration, /update public\.chat_messages\s+set\s+body/i);
});

test('iteration 136 prevents E2E mode on public channels and gates activation as pending', () => {
  assert.match(migration, /check \(is_public is false or e2e_mode = 'off'\)/i);
  assert.match(migration, /set e2e_mode='pending'/i);
  assert.match(migration, /E2E remains inactive until the production protocol/i);
  assert.match(migration, /rim_guard_e2e_activation/i);
  assert.match(migration, /e2e_required_plaintext_message_rejected/i);
  assert.match(migration, /e2e_required_plaintext_channel_post_rejected/i);
});

test('app registers E2E scope repository in fail-closed mode', () => {
  assert.match(app, /new E2EScopeRepository\([^\n]+protocolReady: false/);
});


test('raw E2E runtime and local-store APIs are not exposed as window globals', () => {
  assert.doesNotMatch(app, /window\.rimE2ESignalRuntime\s*=/);
  assert.doesNotMatch(app, /window\.rimE2EMessageStore\s*=/);
  assert.doesNotMatch(app, /window\.rimE2ESendDirect\s*=/);
  assert.match(app, /container\.value\('e2eSignalRuntime'/);
});
