import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261120204000_rim_iteration_129_rls_policy_dedup_initplan.sql'), 'utf8');

test('RLS initplan migration caches auth.uid per statement', () => {
  assert.match(sql, /replace\(v_qual,'auth\.uid\(\)','\(select auth\.uid\(\)\)'\)/);
  assert.match(sql, /replace\(v_check,'auth\.uid\(\)','\(select auth\.uid\(\)\)'\)/);
});

test('RLS migration removes only known exact duplicate policies', () => {
  assert.match(sql, /drop policy if exists channel_comments_insert on public\.channel_post_comments/);
  assert.match(sql, /drop policy if exists "Users can view own music" on public\.music_tracks/);
  assert.match(sql, /drop policy if exists bulletin_read on public\.bulletin_posts/);
});
