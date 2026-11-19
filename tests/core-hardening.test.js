import test from 'node:test';
import assert from 'node:assert/strict';
import { Container } from '../src/core/container.js';
import { EventBus } from '../src/core/event-bus.js';
import { HealthRegistry } from '../src/core/health.js';

test('container reports complete circular dependency chain', () => {
  const c = new Container();
  c.factory('a', x => x.get('b')).factory('b', x => x.get('a'));
  assert.throws(() => c.get('a'), /a -> b -> a/);
});

test('container rejects duplicate registrations and undefined factory values', () => {
  const c = new Container();
  c.value('x', 1);
  assert.throws(() => c.factory('x', () => 2), /already registered/);
  c.factory('y', () => undefined);
  assert.throws(() => c.get('y'), /returned undefined/);
});

test('container disposes resolved services once and rejects later resolution', async () => {
  const c = new Container(); let count = 0;
  c.factory('service', () => ({ dispose() { count += 1; } }));
  c.get('service'); await c.dispose(); await c.dispose();
  assert.equal(count, 1);
  assert.throws(() => c.get('service'), /disposed/);
});

test('event bus isolates failing subscribers and continues delivery', () => {
  const errors = []; const bus = new EventBus({ onError: (error, type) => errors.push([error.message, type]) });
  let called = 0; bus.on('event', () => { throw new Error('broken'); }); bus.on('event', () => { called += 1; });
  assert.equal(bus.emit('event', {}), 1);
  assert.equal(called, 1); assert.deepEqual(errors, [['broken', 'event']]);
});

test('event bus supports once and already-aborted signals', () => {
  const bus = new EventBus(); let count = 0;
  bus.once('one', () => { count += 1; }); bus.emit('one'); bus.emit('one');
  const controller = new AbortController(); controller.abort();
  bus.on('never', () => { count += 10; }, { signal: controller.signal }); bus.emit('never');
  assert.equal(count, 1); assert.equal(bus.listenerCount('one'), 0);
});

test('health checks time out and registry supports unregister', async () => {
  const health = new HealthRegistry({ timeoutMs: 100 });
  health.register('slow', () => new Promise(() => {}));
  const remove = health.register('ok', () => {});
  remove();
  const result = await health.run();
  assert.equal(result.status, 'degraded');
  assert.match(result.checks[0].message, /timed out/);
});
