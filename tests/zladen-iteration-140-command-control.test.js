import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../supabase/migrations/20261121160000_rim_iteration_140_zladen_command_control.sql', import.meta.url), 'utf8');

test('Zladen aliases are local to a conversation and dispatch one canonical command', () => {
  assert.match(sql, /create or replace function private\.rim_zladen_resolve_command_alias/);
  assert.match(sql, /where conversation_id=new\.conversation_id and alias=v_alias/);
  assert.match(sql, /'\/'\|\|v_command/);
  assert.match(sql, /zladen-alias:'\|\|new\.id::text/);
  assert.match(sql, /purpose text not null check\(purpose in \('alias'\)\)/);
});

test('Alias dispatch uses a private transaction marker, not client-controlled metadata', () => {
  assert.match(sql, /create table if not exists private\.rim_zladen_internal_dispatch/);
  assert.match(sql, /transaction_id=txid_current\(\)/);
  assert.match(sql, /revoke all on private\.rim_zladen_internal_dispatch from public,anon,authenticated/);
  assert.doesNotMatch(sql, /if coalesce\(new\.client_message_id,' '\) like 'zladen-alias:/);
});

test('Per-chat command restrictions are enforced before every AFTER INSERT dispatcher', () => {
  assert.match(sql, /create or replace function private\.rim_zladen_command_gate/);
  assert.match(sql, /create trigger rim_zladen_command_gate before insert on public\.chat_messages/);
  assert.match(sql, /v_rank<v_permission\.min_rank/);
  assert.match(sql, /not v_permission\.enabled/);
  assert.match(sql, /select command into v_alias[\s\S]*v_command:=coalesce\(v_alias,v_command\)/);
  assert.match(sql, /return null/);
});

test('Only authorized administrators can manage aliases, permissions and report triage', () => {
  assert.match(sql, /if v_rank<4 then v_reply:='Управлять псевдонимами/);
  assert.match(sql, /if v_rank<4 then v_reply:='Настраивать доступ к командам/);
  assert.match(sql, /if v_rank<4 then v_reply:='Очередь жалоб доступна администрации/);
  assert.match(sql, /report_status_changed/);
  assert.match(sql, /command_permission_set/);
});

test('Synthetic alias dispatch is excluded from human activity counters and anti-flood limits', () => {
  assert.match(sql, /create or replace function private\.rim_zladen_rate_limit_message/);
  assert.match(sql, /create or replace function private\.rim_zladen_track_message_stats/);
  assert.match(sql, /rim_zladen_internal_dispatch[\s\S]{0,300}return new/);
});

test('Zladen command-control functions exclude E2E-required conversations', () => {
  const functions = ['rim_zladen_manage_commands','rim_zladen_resolve_command_alias','rim_zladen_command_gate'];
  for (const name of functions) {
    const start = sql.indexOf(`create or replace function private.${name}`);
    assert.notEqual(start, -1, `missing ${name}`);
    const end = sql.indexOf('end $$;', start);
    assert.notEqual(end, -1);
    assert.match(sql.slice(start, end), /coalesce\(v_group\.e2e_mode,'off'\)='required'/, `${name} must skip E2E-required groups`);
  }
});

test('Group welcome can be toggled and rules reset without saving control words as literal content', () => {
  assert.match(sql, /create or replace function private\.rim_zladen_group_settings_gate/);
  assert.match(sql, /v_command='setwelcome' and v_rest in \('on','off'\)/);
  assert.match(sql, /v_command='setrules' and v_rest='clear'/);
  assert.match(sql, /welcome_enabled=\(v_rest='on'\)/);
  assert.match(sql, /Правила пока не заданы администратором\./);
  assert.match(sql, /create trigger rim_zladen_group_settings_gate before insert on public\.chat_messages/);
  assert.match(sql, /coalesce\(v_group\.e2e_mode,'off'\)='required' then return new/);
});
