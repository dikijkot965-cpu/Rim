import test from 'node:test';
import assert from 'node:assert/strict';
import { DisposableScope } from '../src/core/disposable-scope.js';

test('scope disposes resources once in reverse order', () => {
  const order = [];
  const scope = new DisposableScope();
  scope.add(() => order.push('first'));
  scope.add(() => order.push('second'));
  scope.dispose();
  scope.dispose();
  assert.deepEqual(order, ['second', 'first']);
  assert.equal(scope.size, 0);
});

test('scope removes listeners and disconnects observers', () => {
  const scope = new DisposableScope();
  const events = [];
  const target = {
    addEventListener: (type, fn) => events.push(['add', type, fn]),
    removeEventListener: (type, fn) => events.push(['remove', type, fn])
  };
  const listener = () => {};
  scope.listen(target, 'click', listener);
  let disconnected = 0;
  const observer = { observe() {}, disconnect() { disconnected++; } };
  scope.observe(observer, {}, {});
  scope.dispose();
  assert.equal(events[0][0], 'add');
  assert.equal(events[1][0], 'remove');
  assert.equal(events[1][2], listener);
  assert.equal(disconnected, 1);
});

test('adding a disposer after disposal runs it immediately', () => {
  const scope = new DisposableScope();
  scope.dispose();
  let called = 0;
  scope.add(() => called++);
  assert.equal(called, 1);
});
