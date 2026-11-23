import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../supabase/migrations/20261121170000_rim_iteration_141_zladen_games_economy_triggers.sql', import.meta.url), 'utf8');

test('Iteration 141 adds a non-cash item catalogue, inventory and player market', () => {
  assert.match(sql, /create table if not exists public\.rim_zladen_item_catalog/);
  assert.match(sql, /create table if not exists public\.rim_zladen_inventory/);
  assert.match(sql, /create table if not exists public\.rim_zladen_market_listings/);
  assert.match(sql, /status in \('active','sold','cancelled'\)/);
  assert.match(sql, /for update/);
  assert.match(sql, /balance=balance-v_amount/);
  assert.match(sql, /balance=balance\+v_amount/);
  assert.match(sql, /rim_zladen_market/);
  assert.match(sql, /market_buy/);
  assert.match(sql, /market_cancel/);
});

test('Market purchases lock listings, debit the buyer and credit the seller in one transaction', () => {
  const start = sql.indexOf("elsif v_command='market_buy'");
  const end = sql.indexOf("elsif v_command='market_cancel'", start);
  assert.ok(start >= 0 && end > start);
  const block = sql.slice(start, end);
  assert.match(block, /for update/);
  assert.match(block, /balance=balance-v_amount/);
  assert.match(block, /balance=balance\+v_amount/);
  assert.match(block, /update public\.rim_zladen_market_listings/);
  assert.match(block, /insert into public\.rim_zladen_ledger/);
  assert.match(block, /v_listing_row\.seller_id=new\.sender_id/);
});

test('Daily reward and trivia attempts are idempotent per UTC day', () => {
  assert.match(sql, /primary key\(user_id,day_key\)/);
  assert.match(sql, /zladen-daily:/);
  assert.match(sql, /zladen-quiz:/);
  assert.match(sql, /on conflict\(user_id,day_key\) do nothing/);
  assert.match(sql, /answered_at is null/);
  assert.match(sql, /Сегодняшняя попытка уже использована/);
});

test('Trivia awards points only for a correct answer and never accepts a stake', () => {
  assert.match(sql, /if v_correct then/);
  assert.match(sql, /values\(new\.sender_id,20,v_balance,'grant'/);
  assert.match(sql, /never wagered|без ставок/i);
});

test('Group triggers use allowlisted text matching and safe reply or bounded reward actions', () => {
  assert.match(sql, /action_type in \('warn','mute','notify_admins','audit','reply','grant_points'\)/);
  assert.match(sql, /'contains','starts_with','equals'/);
  assert.match(sql, /reply:'|grant:/);
  assert.match(sql, /least\(1000/);
  assert.match(sql, /zladen-trigger:/);
  assert.match(sql, /rim_zladen_trigger_logs/);
  assert.match(sql, /rim_zladen_trigger_claims/);
  assert.match(sql, /event_type='join'/);
  const joinStart = sql.indexOf('create or replace function private.rim_zladen_handle_member_join_triggers');
  const joinEnd = sql.indexOf('end $$;', joinStart);
  assert.ok(joinStart >= 0 && joinEnd > joinStart);
  assert.match(sql.slice(joinStart, joinEnd), /coalesce\(v_group\.e2e_mode,'off'\)='required' then return new/);
  assert.match(sql, /rim_zladen_handle_member_join_triggers/);
  assert.match(sql, /trigger join_add/);
  assert.match(sql, /limit 3 loop/);
  assert.doesNotMatch(sql, /execute\s+immediate|\beval\s*\(/i);
});

test('Trigger management is group-admin-only and supports safe deletion by validated ID prefix', () => {
  assert.match(sql, /if v_rank<4 then v_reply:='Настраивать триггеры могут только администраторы\.'/);
  assert.match(sql, /\[0-9a-fA-F\]\{8,32\}/);
  assert.match(sql, /where conversation_id=new\.conversation_id and id::text like lower\(split_part/);
});

test('All new bot command paths fail closed for E2E-required conversations', () => {
  const start = sql.indexOf('create or replace function private.rim_zladen_handle_games_economy_triggers');
  const end = sql.indexOf('end $$;', start);
  assert.ok(start >= 0 && end > start);
  assert.match(sql.slice(start, end), /coalesce\(v_group\.e2e_mode,'off'\)='required' then return new/);
});

