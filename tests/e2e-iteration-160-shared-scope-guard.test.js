import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase/migrations/20261122120000_rim_iteration_160_e2e_shared_scope_relay_guard.sql', import.meta.url), 'utf8');
const lab = fs.readFileSync(new URL('../src/security/e2e/e2e-live-lab.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const edge = fs.readFileSync(new URL('../supabase/functions/rim-e2e-relay/index.ts', import.meta.url), 'utf8');
const metadataMigration = fs.readFileSync(new URL('../supabase/migrations/20261122123000_rim_iteration_161_e2e_peer_metadata_scope_guard.sql', import.meta.url), 'utf8');
const legacyMigration = fs.readFileSync(new URL('../supabase/migrations/20261122130000_rim_iteration_162_disable_legacy_prekey_claim.sql', import.meta.url), 'utf8');

test('Iteration 160 protects both prekey fetch and ciphertext mailbox inserts with shared-scope membership', () => {
  assert.match(migration, /security\s+definer[\s\S]*?set\s+search_path\s*=\s*pg_catalog,\s*public/i);
  assert.match(migration, /rim_e2e_relay_prekey_fetch_limits[\s\S]*?rim_e2e_prekey_shared_scope_guard/i);
  assert.match(migration, /rim_e2e_relay_envelopes[\s\S]*?rim_e2e_envelope_shared_scope_guard/i);
  assert.match(migration, /c\.type\s*=\s*'direct'/i);
  assert.match(migration, /c\.type\s*=\s*'group'\s+and\s+c\.is_private\s+is\s+true/i);
  assert.match(migration, /ch\.is_public\s+is\s+false/i);
  assert.match(migration, /shared_e2e_scope_required/);
  assert.match(migration, /revoke\s+all[\s\S]*?from\s+public,\s*anon,\s*authenticated/i);
});

test('Iteration 160 live lab is opt-in and never marks protocolReady or auto-enrolls on app startup', () => {
  assert.match(lab, /URLSearchParams\(windowRef\.location\.search\)\.has\('rim-e2e-lab'\)/);
  assert.match(lab, /windowRef\.confirm\(/);
  assert.match(lab, /runtime\.startIncoming\(\)/);
  assert.match(lab, /runtime\.sendDirect\(/);
  assert.match(lab, /selectedScope === 'direct' && \(memberIds\.length !== 2/);
  assert.match(lab, /selectedScope === 'group'/);
  assert.match(lab, /selectedScope === 'private_channel'/);
  assert.match(app, /bindE2ELiveLab\(/);
  assert.match(app, /protocolReady: false/);
});


test('Iteration 161 limits peer device and identity metadata to users sharing an eligible RIM scope', () => {
  assert.match(metadataMigration, /rim_e2e_users_share_scope/);
  assert.match(metadataMigration, /grant execute[\s\S]*to service_role/i);
  assert.match(edge, /action === "get_devices" \|\| action === "get_active_devices"[\s\S]*rim_e2e_users_share_scope/);
  assert.match(edge, /action === "get_identity"[\s\S]*rim_e2e_users_share_scope/);
  assert.match(edge, /shared_e2e_scope_required/);
});


test('Iteration 162 disables the unused legacy authenticated prekey-claim RPC', () => {
  assert.match(legacyMigration, /revoke all on function public\.rim_e2e_claim_prekey_bundle\(uuid,uuid\)[\s\S]*from public, anon, authenticated/i);
  assert.match(legacyMigration, /grant execute[\s\S]*to service_role/i);
  assert.doesNotMatch(fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8'), /E2EDeviceRepository/);
});
