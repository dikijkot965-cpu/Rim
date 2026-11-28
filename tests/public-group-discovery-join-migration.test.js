import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20261128053725_rim_iteration_183_public_group_discovery_join.sql', import.meta.url), 'utf8');

test('public group discovery exposes only public group rows and joins through a guarded RPC', () => {
  assert.match(sql, /for select\s+to authenticated\s+using \(type='group' and is_private=false\)/i);
  assert.match(sql, /rim_group_join_public\(p_conversation_id uuid\)/i);
  assert.match(sql, /v_group\.is_private/i);
  assert.match(sql, /v_group\.e2e_mode/i);
  assert.match(sql, /rim_zladen_bans/i);
  assert.match(sql, /on conflict\(conversation_id,user_id\) do nothing/i);
  assert.match(sql, /grant execute on function public\.rim_group_join_public\(uuid\) to authenticated/i);
});
