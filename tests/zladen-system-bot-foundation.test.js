import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase/migrations/20261121121000_rim_iteration_136_zladen_system_bot.sql', import.meta.url), 'utf8');
const edge = fs.readFileSync(new URL('../supabase/functions/rim-zladen/index.ts', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('Zladen system identity is provisioned through Auth Admin, not a fabricated auth.users row', () => {
  assert.match(migration, /does not insert a fake row into auth\.users/i);
  assert.match(edge, /auth\.admin\.createUser/);
  assert.match(edge, /RIM_OWNER_USER_ID/);
  assert.match(edge, /app_user_roles/);
  assert.match(edge, /data.length!==1/);
  assert.match(edge, /app_user_roles/);
  assert.match(edge, /rim_bots\"\)\.delete\(\)/);
});

test('Zladen installs one default direct chat per user and supports blocked/unsubscribed states', () => {
  assert.match(migration, /rim_system_bot_installs/);
  assert.match(migration, /'active','blocked','unsubscribed'/);
  assert.match(migration, /rim_zladen_install_for_user/);
  assert.match(migration, /rim_zladen_set_install_state/);
  assert.match(migration, /rim_zladen_handle_message/);
  assert.match(migration, /Я Злыдя — системный помощник РИМа/);
  assert.match(migration, /v_command='\/ping'/);
});

test('Zladen profile editing is owner-gated and the client installs on sign-in', () => {
  assert.match(edge, /auth\.user\.id!==ownerId/);
  assert.match(edge, /action==="owner_update"/);
  assert.match(app, /event === 'SIGNED_IN'\) void ensureZladenChat/);
});
