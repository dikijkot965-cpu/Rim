import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Iteration 184 extends Zladen game aliases, golden dice, group pairing and RP actions', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261128130000_rim_iteration_184_zladen_social_game_commands.sql', import.meta.url), 'utf8');
  for (const command of ['golden_dice', 'pair_all', 'ping', 'hug', 'pat', 'tea', 'dice']) {
    assert.ok(sql.includes(command), `missing Zladen command: ${command}`);
  }
  assert.match(sql, /v_command in \('roll','dice','кубы','куб'\)/);
  assert.match(sql, /Случайный общий пейринг/);
  assert.match(sql, /Злыдя обнимает/);
  assert.match(sql, /СПРАВКА \/' \|\| v_command/);
});

test('game event constraint includes the new tracked games', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261128130000_rim_iteration_184_zladen_social_game_commands.sql', import.meta.url), 'utf8');
  assert.match(sql, /'golden_dice','random','choose','yesno','percent','who','pair'/);
  assert.match(sql, /'pair_all','ping','say','social'/);
});
