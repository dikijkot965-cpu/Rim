import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = [
  '20261128053459_rim_iteration_183_zladen_help_details.sql',
  '20261128054228_rim_iteration_183_zladen_help_secret_scope_guard.sql'
].map(name => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8')).join('\\n');

test('Zladen command help supports command-specific descriptions and custom aliases', () => {
  assert.match(sql, /before insert on public\.chat_messages/i);
  assert.match(sql, /v_token <> '\/help'/i);
  assert.match(sql, /rim_zladen_custom_commands/i);
  assert.match(sql, /rim_zladen_command_aliases/i);
  assert.match(sql, /e2e_mode[^;]+pending[^;]+required/is);
  assert.match(sql, /is_secret is true/i);
  assert.match(sql, /return null;/i);
  assert.match(sql, /when 'pollclose'/i);
  assert.match(sql, /when 'reportresolve'/i);
});
