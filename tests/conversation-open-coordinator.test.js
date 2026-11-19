import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationOpenCoordinator } from '../src/application/conversation-open-coordinator.js';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

test('runs navigation cleanup before the original opener and post-open work after it', async () => {
  const calls = [];
  const coordinator = new ConversationOpenCoordinator({
    beforeOpen: async ({ id }) => { calls.push(`before:${id}`); return true; },
    afterOpen: async ({ id, result }) => { calls.push(`after:${id}:${result}`); }
  });
  const receiver = { marker: true };
  const result = await coordinator.open({
    id: 'c1', receiver, args: ['extra'],
    original: function (id, extra) { calls.push(`open:${id}:${extra}:${this.marker}`); return 'opened'; }
  });
  assert.equal(result, 'opened');
  assert.deepEqual(calls, ['before:c1', 'open:c1:extra:true', 'after:c1:opened']);
});

test('skips stale post-open effects when a newer conversation finishes first', async () => {
  const firstOpen = deferred();
  const after = [];
  const coordinator = new ConversationOpenCoordinator({ afterOpen: async ({ id }) => after.push(id) });
  const first = coordinator.open({ id: 'c1', original: () => firstOpen.promise });
  await Promise.resolve();
  const second = await coordinator.open({ id: 'c2', original: async () => 'second' });
  firstOpen.resolve('first');
  await first;
  assert.equal(second, 'second');
  assert.deepEqual(after, ['c2']);
});

test('a newer request during preflight prevents the older opener from running', async () => {
  const firstPreflight = deferred();
  const opened = [];
  let count = 0;
  const coordinator = new ConversationOpenCoordinator({
    beforeOpen: () => (++count === 1 ? firstPreflight.promise : true)
  });
  const first = coordinator.open({ id: 'c1', original: () => opened.push('c1') });
  await Promise.resolve();
  await coordinator.open({ id: 'c2', original: () => opened.push('c2') });
  firstPreflight.resolve(true);
  await first;
  assert.deepEqual(opened, ['c2']);
});

test('preflight failure fails closed without invoking the legacy opener', async () => {
  const errors = [];
  const coordinator = new ConversationOpenCoordinator({
    beforeOpen: async () => { throw new Error('writer save failed'); },
    logger: { error: (...args) => errors.push(args) }
  });
  let called = false;
  const result = await coordinator.open({ id: 'c1', original: () => { called = true; } });
  assert.equal(result, undefined);
  assert.equal(called, false);
  assert.equal(errors.length, 1);
});

test('dispose invalidates in-flight work and rejects subsequent opens', async () => {
  const pending = deferred();
  const after = [];
  const coordinator = new ConversationOpenCoordinator({ afterOpen: ({ id }) => after.push(id) });
  const opening = coordinator.open({ id: 'c1', original: () => pending.promise });
  await Promise.resolve();
  coordinator.dispose();
  pending.resolve('done');
  await opening;
  assert.deepEqual(after, []);
  assert.equal(await coordinator.open({ id: 'c2', original: async () => 'no' }), undefined);
});
