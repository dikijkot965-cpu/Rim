import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/composition/features-surface.js', import.meta.url), 'utf8');

test('music render failures show a visible error state with a retry action', () => {
  assert.match(source, /Музыка временно недоступна/);
  assert.match(source, /Повторить загрузку/);
  assert.match(source, /music\.root\?\.replaceChildren/);
  assert.match(source, /win\.loadMusic\?\./);
});
