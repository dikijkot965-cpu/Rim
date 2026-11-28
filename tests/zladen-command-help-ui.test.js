import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/application/zladen-group-console-controller.js', import.meta.url), 'utf8');

test('Zladen quick-command panel explains the action behind every preset', () => {
  assert.match(source, /const COMMAND_DESCRIPTIONS = \{/);
  assert.match(source, /COMMAND_DESCRIPTIONS\[command\]/);
  assert.match(source, /<span class="rim-zc-muted">/);
  assert.match(source, /\['Справка','\/help'\]/);
});
