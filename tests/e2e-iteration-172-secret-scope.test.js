import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase/migrations/20261122160000_rim_iteration_172_e2e_secret_scope_reconcile.sql', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('Iteration 172 restores production-backed secret direct chat creation with strict E2E mode', () => {
  assert.match(migration, /create or replace function public\.rim_create_secret_direct_chat/i);
  assert.match(migration, /values\('direct',v_user,null,true,true,'required',1,'OPEN-E2EE-SP1'\)/i);
  assert.match(migration, /user_blocks/i);
  assert.match(migration, /grant execute .*rim_create_secret_direct_chat.*authenticated/i);
  assert.match(migration, /rim_guard_secret_chat_mode/i);
});

test('Iteration 172 restores protected activation and last-message touch RPCs from production', () => {
  assert.match(migration, /create or replace function public\.rim_e2e_activate_scope/i);
  assert.match(migration, /e2e_members_missing_devices/i);
  assert.match(migration, /protocol_profile='OPEN-E2EE-SP1'/i);
  assert.match(migration, /create or replace function public\.rim_e2e_touch_scope/i);
  assert.match(migration, /e2e_scope_access_denied/i);
  assert.match(migration, /revoke all on function public\.rim_e2e_touch_scope\(text,uuid\) from public, anon/i);
});

test('secret-chat header verification proves the full participant set before readiness', () => {
  assert.match(app, /verifyScopeExchange\(\{ type: 'direct', id: conversation\.id \}, scope\.value\.memberUserIds\)/);
  assert.doesNotMatch(app, /verifyPeerExchange\(scope\.value\.peerUserId/);
});
