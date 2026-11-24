import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase/migrations/20261124085719_rim_iteration_171_zladen_reminders_scheduler.sql', import.meta.url), 'utf8');

test('Zladen reminder command replaces the old non-functional stub', () => {
  assert.match(migration, /v_command='remind'/i);
  assert.match(migration, /rim_zladen_reminders\(user_id,conversation_id,reminder_text,due_at,timezone,recurrence\)/i);
  assert.match(migration, /v_duration !~ '\^\[1-9\]\[0-9\]\{0,3\}\(m\|h\|d\|w\)\$'/i);
  assert.match(migration, /status='cancelled'/i);
  assert.match(migration, /v_reminder_text !~ '\^\[0-9a-f\]\{8,36\}\$'/i);
  assert.match(migration, /status='pending'/i);
});

test('reminder dispatcher is durable, concurrency-safe, idempotent and skips E2E scopes', () => {
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /zladen-reminder:/i);
  assert.match(migration, /coalesce\(v_conversation\.e2e_mode,'off'\)='required'/i);
  assert.match(migration, /status='failed'/i);
  assert.match(migration, /when 'daily' then interval '1 day'/i);
  assert.match(migration, /when 'weekly' then interval '1 week'/i);
  assert.match(migration, /when 'monthly' then interval '1 month'/i);
});

test('pg_cron job is installed idempotently once per minute', () => {
  assert.match(migration, /cron\.job where jobname='rim-zladen-reminders'/i);
  assert.match(migration, /cron\.unschedule\(v_job\)/i);
  assert.match(migration, /cron\.schedule\('rim-zladen-reminders','\* \* \* \* \*'/i);
});
