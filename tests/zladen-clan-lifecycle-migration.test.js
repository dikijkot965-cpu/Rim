import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase/migrations/20261122140000_rim_iteration_170_zladen_clan_lifecycle.sql', import.meta.url), 'utf8');

test('Zladen clan lifecycle migration uses a server-owned trigger and closes direct table access', () => {
  assert.match(migration, /create table if not exists public\.rim_zladen_clan_invites/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on public\.rim_zladen_clan_invites from public, anon, authenticated/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /after insert on public\.chat_messages/i);
  assert.match(migration, /coalesce\(v_conversation\.e2e_mode, 'off'\) = 'required'/i);
});

test('clan invitations store hashes, expire, and are use-limited', () => {
  assert.match(migration, /extensions\.digest\(convert_to\(v_code, 'UTF8'\), 'sha256'\)/i);
  assert.match(migration, /expires_at > now\(\) and uses < max_uses/i);
  assert.match(migration, /uses = uses \+ 1/i);
  assert.doesNotMatch(migration, /code text not null/i);
});

test('clan lifecycle covers create, join, leave, info, top, invites, roles, and visibility', () => {
  for (const action of ['create', 'join', 'leave', 'info', 'top', 'invite', 'visibility', 'kick', 'promote', 'delete']) {
    assert.match(migration, new RegExp(`v_action = '${action}'`, 'i'));
  }
  assert.match(migration, /on conflict \(clan_id, user_id\) do nothing/i);
  assert.match(migration, /zladen-clan:/i);
  assert.match(migration, /clan_role = 'leader'/i);
  assert.match(migration, /clan_role = 'deputy'/i);
});
