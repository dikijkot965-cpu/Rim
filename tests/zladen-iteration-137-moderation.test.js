import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../supabase/migrations/20261121130000_rim_iteration_137_zladen_group_moderation.sql', import.meta.url), 'utf8');

test('Zladen group moderation migration creates isolated settings and audit storage', () => {
  for (const table of [
    'rim_zladen_group_settings', 'rim_zladen_warnings', 'rim_zladen_mutes',
    'rim_zladen_bans', 'rim_zladen_custom_commands', 'rim_zladen_audit'
  ]) assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(sql, /enable row level security/g);
  assert.match(sql, /revoke all on public\.rim_zladen_group_settings[\s\S]*from anon,authenticated/);
});

test('mute and ban actions are enforced at the database boundary', () => {
  assert.match(sql, /create trigger rim_zladen_enforce_group_mute before insert on public\.chat_messages/);
  assert.match(sql, /create trigger rim_zladen_block_banned_member before insert on public\.conversation_members/);
  assert.match(sql, /rim_zladen_muted_until/);
  assert.match(sql, /rim_zladen_group_ban_active/);
});

test('Zladen supports real group administration commands and custom commands', () => {
  for (const command of ['/rules', '/setrules', '/setwelcome', '/warn', '/warnings', '/clearwarns', '/mute', '/unmute', '/kick', '/ban', '/unban', '/command', '/delcommand', '/stats', '/admins']) {
    assert.ok(sql.includes(command), `missing ${command}`);
  }
  assert.match(sql, /v_actor_manager/);
  assert.match(sql, /rim_zladen_audit/);
});

test('Zladen does not read or write plaintext in required E2E groups', () => {
  assert.equal((sql.match(/coalesce\(v_group\.e2e_mode,'off'\)='required' then return new/g) || []).length, 2);
});

test('reactivating Zladen restores the existing personal chat membership', () => {
  assert.match(sql, /if p_state='active' then[\s\S]*insert into public\.conversation_members/);
});
