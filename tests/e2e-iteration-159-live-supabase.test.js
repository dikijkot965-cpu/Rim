import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration143 = fs.readFileSync(new URL('../supabase/migrations/20261121190000_rim_iteration_143_e2e_relay_hardening.sql', import.meta.url), 'utf8');
const migration158 = fs.readFileSync(new URL('../supabase/migrations/20261122110000_rim_iteration_158_e2e_device_revocation_tombstones.sql', import.meta.url), 'utf8');

test('Iteration 143 does not revoke the legacy overload after dropping it', () => {
  const drop = migration143.indexOf('drop function if exists public.rim_e2e_relay_fetch_prekey_bundle(uuid,uuid,smallint,text)');
  const create = migration143.indexOf('create function public.rim_e2e_relay_fetch_prekey_bundle(', drop);
  assert.ok(drop >= 0 && create > drop, 'legacy overload is dropped before the replacement is created');
  assert.doesNotMatch(migration143.slice(create), /revoke all on function public\.rim_e2e_relay_fetch_prekey_bundle\(uuid,uuid,smallint,text\)/i);
  assert.match(migration143, /revoke all on function public\.rim_e2e_relay_fetch_prekey_bundle\(uuid,smallint,uuid,smallint,text\)/i);
  assert.match(migration143, /grant execute on function public\.rim_e2e_relay_fetch_prekey_bundle\(uuid,smallint,uuid,smallint,text\) to service_role/i);
});

test('Iteration 158 keeps the revoked primary slot tombstoned and prevents ordinary resurrection', () => {
  assert.match(migration158, /status\s*=\s*'revoked'/i);
  assert.match(migration158, /device_slot_revoked_requires_secure_link/i);
  assert.doesNotMatch(migration158, /on\s+conflict\s*\(user_id,\s*device_id\)\s*do\s+update/i);
});
