import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('recovery-code database is private and one-time consumption is atomic', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261119135738_rim_recovery_codes.sql'), 'utf8');
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.rim_recovery_codes from public, anon, authenticated/i);
  assert.match(sql, /grant all on table public\.rim_recovery_codes to service_role/i);
  assert.match(sql, /update public\.rim_recovery_codes[\s\S]*?used_at is null[\s\S]*?returning user_id/i);
  assert.match(sql, /revoke all on function public\.rim_consume_recovery_code\(text\) from public, anon, authenticated/i);
});

test('recovery Edge Function uses server-only HMAC material and privileged table access', () => {
  const source = fs.readFileSync(path.join(root, 'supabase/functions/rim-account-security/index.ts'), 'utf8');
  assert.match(source, /rim_hash_recovery_credential/);
  assert.match(source, /LEGACY_PEPPER/);
  assert.doesNotMatch(source, /Deno\.env\.get\(\"RIM_RECOVERY_PEPPER\"\)/);
  assert.match(source, /HKDF/);
  assert.match(source, /SERVICE_ROLE_KEY/);
  assert.match(source, /name: "HMAC"/);
  assert.match(source, /rim_rotate_recovery_codes/);
  assert.match(source, /rim_consume_recovery_code/);
  assert.match(source, /rim_consume_recovery_phrase/);
  assert.match(source, /rim_check_recovery_rate_limit/);
  assert.match(source, /validRecoveryPhrase/);
  assert.match(source, /RIM\/account-security\/v1/);
  assert.match(source, /admin\.from\("rim_recovery_codes"\)/);
});


test('recovery phrase uses a 184-bit entropy format with a checksum and is explicitly not BIP-39', () => {
  const source = fs.readFileSync(path.join(root, 'src/domain/recovery-phrase.js'), 'utf8');
  assert.match(source, /new Uint8Array\(23\)/);
  assert.match(source, /SHA-256/);
  assert.match(source, /NOT BIP-39/);
  assert.match(source, /length !== 256/);
});

test('12-word RIM phrase uses a separate 2048-token dictionary and 128-bit entropy', () => {
  const source = fs.readFileSync(path.join(root, 'src/domain/recovery-phrase.js'), 'utf8');
  assert.match(source, /RECOVERY_WORDS_12/);
  assert.match(source, /new Uint8Array\(16\)/);
  assert.match(source, /slice\(128\)/);
  assert.match(source, /NOT compatible with BIP-39/i);
  const edge = fs.readFileSync(path.join(root, 'supabase/functions/rim-account-security/index.ts'), 'utf8');
  assert.match(edge, /recoveryWords12/);
  assert.match(edge, /words.length === 12/);
});
