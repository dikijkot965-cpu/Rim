import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase/migrations/20261122110000_rim_iteration_158_e2e_device_revocation_tombstones.sql', import.meta.url), 'utf8');
const relay = fs.readFileSync(new URL('../supabase/functions/rim-e2e-relay/index.ts', import.meta.url), 'utf8');

function functionBody(source, signature) {
  const start = source.toLowerCase().indexOf(signature.toLowerCase());
  assert.notEqual(start, -1, `missing SQL function: ${signature}`);
  const next = source.indexOf('$$;', start);
  assert.notEqual(next, -1, `unterminated SQL function: ${signature}`);
  return source.slice(start, next + 3);
}

test('device revocation leaves a durable tombstone instead of deleting the device slot', () => {
  const body = functionBody(migration, 'create or replace function public.rim_e2e_relay_remove_device');
  assert.match(body, /status\s*=\s*'revoked'/i);
  assert.match(body, /enabled\s*=\s*false/i);
  assert.match(body, /registered\s*=\s*false/i);
  assert.match(body, /revoked_at\s*=\s*coalesce\(revoked_at, now\(\)\)/i);
  assert.doesNotMatch(body, /delete\s+from\s+public\.rim_e2e_relay_devices/i);
  assert.match(body, /delete\s+from\s+public\.rim_e2e_relay_prekeys/i);
  assert.match(body, /delete\s+from\s+public\.rim_e2e_relay_envelopes/i);
});

test('device registration cannot reactivate a revoked primary slot', () => {
  const body = functionBody(migration, 'create or replace function public.rim_e2e_relay_register_device');
  assert.match(body, /v_existing\.status\s*=\s*'revoked'\s+or\s+v_existing\.revoked_at\s+is\s+not\s+null/i);
  assert.match(body, /device_slot_revoked_requires_secure_link/i);
  assert.match(body, /primary_device_already_registered/i);
  assert.match(body, /v_existing\.registered\s+then/i);
  assert.doesNotMatch(body, /on\s+conflict\s*\(user_id,\s*device_id\)\s*do\s+update/i);
});

test('revocation and registration RPCs remain service-role-only', () => {
  assert.match(migration, /revoke all on function public\.rim_e2e_relay_remove_device\(uuid, smallint\)\s+from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.rim_e2e_relay_remove_device\(uuid, smallint\)\s+to service_role/i);
  assert.match(migration, /revoke all on function public\.rim_e2e_relay_register_device\(uuid, smallint, text, text\)\s+from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.rim_e2e_relay_register_device\(uuid, smallint, text, text\)\s+to service_role/i);
});

test('relay rejects oversized streamed requests before JSON parsing and maps the size error to HTTP 413', () => {
  assert.match(relay, /content-length/i);
  assert.match(relay, /req\.body\?\.getReader\(\)/);
  assert.match(relay, /totalBytes\s*>\s*MAX_BODY_BYTES/);
  assert.match(relay, /reader\.cancel\("request_too_large"\)/);
  assert.match(relay, /message\s*===\s*"request_too_large"\)\s*return\s*413/);
});
