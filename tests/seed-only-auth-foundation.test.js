import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('new recovery credentials use Vault-backed HMAC while legacy derivation remains available', () => {
  const edge = read('supabase/functions/rim-account-security/index.ts');
  const migration = read('supabase/migrations/20261120193000_rim_iteration_129_seed_vault_and_hook.sql');
  assert.match(edge, /rim_hash_recovery_credential/);
  assert.match(edge, /legacyHmacText/);
  assert.match(edge, /hash_version/);
  assert.match(migration, /vault\.create_secret/);
  assert.match(migration, /revoke all on function public\.rim_hash_recovery_credential/);
  assert.doesNotMatch(edge, /Deno\.env\.get\("RIM_RECOVERY_PEPPER"\)/);
});

test('seed-only activation is two-phase and guarded by Auth Hook readiness', () => {
  const edge = read('supabase/functions/rim-account-security/index.ts');
  const hook = read('supabase/migrations/20261120195000_rim_seed_only_two_phase_activation.sql');
  const grants = read('supabase/migrations/20261120196500_rim_seed_only_rpc_grants_fail_closed.sql');
  assert.match(edge, /rim_seed_only_readiness/);
  assert.match(edge, /rim_seed_only_begin/);
  assert.match(edge, /rim_seed_only_activate/);
  assert.match(edge, /iterations: 600000/);
  assert.match(edge, /seed_login/);
  assert.match(hook, /security invoker/i);
  assert.match(hook, /v_status='pending'/);
  assert.match(hook, /v_method='token_refresh'/);
  assert.match(grants, /revoke all on function public\.rim_seed_only_begin[\s\S]*?from public,anon,authenticated,service_role/i);
  assert.match(grants, /grant execute on function public\.rim_seed_only_begin[\s\S]*?to service_role/i);
});

test('seed-only session gate is restrictive and covers Storage', () => {
  const migration = read('supabase/migrations/20261120193000_rim_iteration_129_seed_vault_and_hook.sql');
  assert.match(migration, /as restrictive for all to authenticated/i);
  assert.match(migration, /private\.rim_seed_session_authorized\(\)/);
  assert.match(migration, /storage\.objects/);
  assert.match(read('supabase/migrations/20261120201000_rim_seed_only_realtime_session_gate.sql'), /realtime\.messages/);
});

test('message mutations require sender ownership and active conversation membership', () => {
  const migration = read('supabase/migrations/20261120192000_rim_iteration_129_message_membership_rls.sql');
  assert.match(migration, /for update to authenticated[\s\S]*sender_id = \(select auth\.uid\(\)\)[\s\S]*is_conversation_member\(conversation_id\)/i);
  assert.match(migration, /for delete to authenticated[\s\S]*sender_id = \(select auth\.uid\(\)\)[\s\S]*is_conversation_member\(conversation_id\)/i);
});

test('channel pinning is server-authorized, not a client-side role check alone', () => {
  const migration = read('supabase/migrations/20261120198000_rim_iteration_129_channel_pinned_posts.sql');
  assert.match(migration, /rim_channel_pin_post/);
  assert.match(migration, /channel_members/);
  assert.match(migration, /channel_management_permission_required/);
  assert.match(migration, /revoke all on function public\.rim_channel_pin_post[\s\S]*?from public,anon/i);
});
