import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('admin dashboard usage RPC exposes database, storage and bucket measurements only to superadmin', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261120210000_rim_iteration_130_admin_usage_metrics.sql'), 'utf8');
  assert.match(sql, /auth\.uid\(\).*superadmin/s);
  assert.match(sql, /pg_database_size\(current_database\(\)\)/);
  assert.match(sql, /storage\.objects/);
  assert.match(sql, /database_quota_bytes/);
  assert.match(sql, /storage_quota_bytes/);
  assert.match(sql, /storage_by_bucket/);
  assert.match(sql, /revoke all on function public\.rim_admin_dashboard_stats_v2\(\) from public, anon/i);
});

test('admin UI renders resource gauges and bucket breakdown from RPC values', () => {
  const source = fs.readFileSync(path.join(root, 'src/composition/admin-surface.js'), 'utf8');
  assert.match(source, /Ресурсы проекта Supabase/);
  assert.match(source, /database_size_bytes/);
  assert.match(source, /storage_by_bucket/);
  assert.match(source, /data-usage-state/);
});
