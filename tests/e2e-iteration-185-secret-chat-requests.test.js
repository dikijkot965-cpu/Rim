import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20261128150000_rim_iteration_185_persistent_secret_chat_requests.sql', import.meta.url), 'utf8');

test('secret chat creation creates a durable pending request, not an already-required scope', () => {
  assert.match(migration, /create table if not exists public\.rim_secret_chat_requests/i);
  assert.match(migration, /status text not null default 'pending'/i);
  assert.match(migration, /values \(\s*'direct', v_user, null, true, false, 'pending'/i);
  assert.match(migration, /recipient_id = p_other_user/i);
  assert.match(migration, /on delete cascade/i);
  assert.match(migration, /alter publication supabase_realtime add table public\.rim_secret_chat_requests/i);
});

test('only the recipient can accept or decline, and acceptance changes only that conversation', () => {
  assert.match(migration, /if v_request\.recipient_id <> v_user then raise exception 'not_secret_chat_recipient'/i);
  assert.match(migration, /set is_secret = true,\s*e2e_mode = 'required'/i);
  assert.match(migration, /set status = 'accepted', accepted_at = now\(\)/i);
  assert.match(migration, /set is_secret = false, e2e_mode = 'off'/i);
  assert.match(migration, /set status = 'declined', declined_at = now\(\)/i);
  assert.match(migration, /revoke all on function public\.rim_accept_secret_chat_request\(uuid\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.rim_accept_secret_chat_request\(uuid\) to authenticated/i);
});

test('E2E activation trigger requires a one-use private authorization capability', () => {
  assert.match(migration, /create table if not exists private\.rim_e2e_activation_authorizations/i);
  assert.match(migration, /authorized_user_id = auth\.uid\(\)/i);
  assert.match(migration, /r\.recipient_id = auth\.uid\(\)/i);
  assert.match(migration, /delete from private\.rim_e2e_activation_authorizations/i);
  assert.match(migration, /e2e_activation_requires_trusted_deployment/i);
});
