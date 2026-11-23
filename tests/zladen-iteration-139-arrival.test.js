import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../supabase/migrations/20261121150000_rim_iteration_139_zladen_group_arrival.sql', import.meta.url), 'utf8');
const platformSql = fs.readFileSync(new URL('../supabase/migrations/20261121140000_rim_iteration_138_zladen_platform_modules.sql', import.meta.url), 'utf8');

test('Zladen posts one onboarding message when added to a non-E2E group', () => {
  assert.match(sql, /create or replace function private\.rim_zladen_group_bot_arrival/);
  assert.match(sql, /zladen-group-arrival:'\|\|new\.conversation_id::text/);
  assert.match(sql, /Привет! Я Злыдя — системный помощник этой группы/);
  assert.match(sql, /coalesce\(v_group\.e2e_mode,'off'\)='required' then return new/);
});

test('Zladen welcomes future members with safe profile substitutions and an onboarding menu', () => {
  assert.match(sql, /replace\(v_text,'\{user\}',v_name\)/);
  assert.match(sql, /replace\(v_text,'\{user_id\}',new\.user_id::text\)/);
  assert.match(sql, /replace\(v_text,'\{count\}',v_count::text\)/);
  assert.match(sql, /zladen-welcome-group:/);
  assert.match(sql, /'/);
});

test('Zladen menu explains user and administrator commands without exposing E2E content', () => {
  assert.match(sql, /rim_zladen_handle_menu_message/);
  assert.match(sql, /'menu','zladen','возможности'/);
  assert.match(platformSql, /'@'\|\|coalesce\(v_bot\.username,'zladen_bot'\)/);
  assert.match(sql, /АДМИНИСТРИРОВАНИЕ/);
  assert.match(sql, /ЗЛЫДЯ • ЛИЧНЫЕ КОМАНДЫ/);
  assert.match(sql, /не читает сообщения и не отвечает в переписках с обязательным E2E/);
});

test('Iteration 138 profile lookup enforces members visibility for both requester and target', () => {
  assert.match(platformSql, /v_profile_visibility='members'.{0,260}new\.sender_id.{0,260}v_target/s);
  assert.match(platformSql, /v_command in \('me','анкета'\) or \(v_command='profile' and v_rest=''\)/);
  assert.match(platformSql, /lower\(username\)=lower\(v_lookup\)/);
  assert.match(platformSql, /like 'кто ты %'/);
});
