import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/application/settings-shell-controller.js', import.meta.url), 'utf8');

test('settings has a working entrypoint to the own profile editor', () => {
  assert.match(source, /data-rim-settings-action="profile"/);
  assert.match(source, /action === 'profile'.*openProfile/s);
});
