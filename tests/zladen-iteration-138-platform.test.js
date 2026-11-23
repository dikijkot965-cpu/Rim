import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../supabase/migrations/20261121140000_rim_iteration_138_zladen_platform_modules.sql', import.meta.url), 'utf8');

test('Zladen iteration 138 adds global profiles, ranks, command permissions and aliases', () => {
  for (const table of ['rim_zladen_user_profiles','rim_zladen_chat_roles','rim_zladen_command_permissions','rim_zladen_command_aliases']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
  }
  assert.match(sql, /rank smallint not null check\(rank between 1 and 4\)/);
  assert.match(sql, /min_rank smallint not null default 0/);
});

test('Zladen economy is a non-cash idempotent ledger, not a wagering system', () => {
  assert.match(sql, /create table if not exists public\.rim_zladen_wallets/);
  assert.match(sql, /create table if not exists public\.rim_zladen_ledger/);
  assert.match(sql, /operation_key text not null unique/);
  assert.match(sql, /Internal points are non-transferable outside RIM and have no cash value/);
  assert.match(sql, /No real-money features, wagering, loot boxes or gambling/);
  assert.doesNotMatch(sql, /betting|wager_command|roulette|casino/i);
});

test('Zladen adds reputation, awards, notes, bookmarks, reports, polls, reminders and clans', () => {
  for (const table of [
    'rim_zladen_reputation_events','rim_zladen_award_catalog','rim_zladen_user_awards',
    'rim_zladen_notes','rim_zladen_bookmarks','rim_zladen_reports','rim_zladen_polls',
    'rim_zladen_poll_votes','rim_zladen_reminders','rim_zladen_clans','rim_zladen_clan_members'
  ]) assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
  for (const tier of ['merit_1','merit_2','merit_3','merit_4','merit_5','merit_6','merit_7','merit_8']) assert.ok(sql.includes(`'${tier}'`));
});

test('Anti-spam is opt-in, stores only a digest and skips E2E-required groups', () => {
  assert.match(sql, /enabled boolean not null default false/);
  assert.match(sql, /md5\(left\(new\.body,4000\)\)/);
  assert.match(sql, /coalesce\(v_group\.e2e_mode,'off'\)='required' then return new/);
  assert.match(sql, /create trigger rim_zladen_rate_limit_message before insert on public\.chat_messages/);
});

test('Extended command engine is idempotent and respects E2E and permission boundaries', () => {
  assert.match(sql, /create or replace function private\.rim_zladen_handle_extended_message/);
  assert.match(sql, /zladen-ext:'\|\|new\.id::text/);
  assert.match(sql, /not enabled or v_rank<min_rank/);
  assert.match(sql, /v_target_rank>=v_rank/);
  assert.match(sql, /profile_visibility='members'/);
  assert.match(sql, /Начислять жетоны могут только администраторы/);
  assert.match(sql, /Злыдя — помощник группы\. Команды участников/);
  assert.match(sql, /coalesce\(v_group\.e2e_mode,'off'\)='required' then return new/);
  for (const command of ['bio','who','privacy','balance','grant','pay','rep','note','notes','report','antispam','rank','award','awards','top','bookmark','bookmarks','unbookmark','poll','vote','pollclose','pollresults']) assert.ok(sql.includes(`v_command='${command}'`), `missing ${command}`);
});

test('Statistics store counters and timestamps, not message body text', () => {
  assert.match(sql, /Message statistics count metadata only/);
  assert.match(sql, /create table if not exists public\.rim_zladen_chat_member_stats/);
  assert.doesNotMatch(sql, /insert into public\.rim_zladen_chat_member_stats\([^)]*body/i);
});
