import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/application/conversation-list-controller.js', import.meta.url), 'utf8');

test('Conversation list keeps one invalidation method that cancels stale loads and renders', () => {
  const matches = [...source.matchAll(/\binvalidate\s*\(\)\s*\{/g)];
  assert.equal(matches.length, 1);
  const method = source.slice(matches[0].index, source.indexOf('\n  }', matches[0].index) + 4);
  assert.match(method, /this\.loadSequence\s*\+=\s*1/);
  assert.match(method, /this\.renderToken\s*\+=\s*1/);
});
