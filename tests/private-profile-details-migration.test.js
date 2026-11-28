import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20261128053821_rim_iteration_183_private_profile_details.sql', import.meta.url), 'utf8');

test('birth date is stored in a separate owner-only table', () => {
  assert.match(sql, /create table if not exists public\.profile_private_details/i);
  assert.match(sql, /user_id uuid primary key references auth\.users/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /user_id = auth\.uid\(\)/i);
  assert.doesNotMatch(sql, /grant .* to anon/i);
});
