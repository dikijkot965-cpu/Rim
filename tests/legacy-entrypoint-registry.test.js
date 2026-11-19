import test from 'node:test';
import assert from 'node:assert/strict';
import { LegacyEntrypointRegistry } from '../src/application/legacy-entrypoint-registry.js';

test('registry wraps an entry point once and preserves the original receiver', () => {
  const target = { calls: 0, run(value) { this.calls++; return value + 1; } };
  const registry = new LegacyEntrypointRegistry(target);
  registry.wrap('run', original => function (value) { return original.call(this, value) * 2; });
  const wrapped = target.run;
  registry.wrap('run', () => { throw new Error('must not wrap twice'); });
  assert.equal(target.run(3), 8);
  assert.equal(target.calls, 1);
  assert.equal(registry.size, 1);
  assert.equal(target.run, wrapped);
});

test('registry restores only wrappers it still owns', () => {
  const target = { run() { return 'old'; } };
  const original = target.run;
  const registry = new LegacyEntrypointRegistry(target);
  registry.wrap('run', fn => function () { return fn() + '-wrapped'; });
  assert.equal(target.run(), 'old-wrapped');
  registry.dispose();
  assert.equal(target.run, original);
  assert.equal(registry.size, 0);
});

test('registry does not overwrite a later owner during disposal', () => {
  const target = { run() { return 'old'; } };
  const registry = new LegacyEntrypointRegistry(target);
  registry.wrap('run', fn => function () { return fn(); });
  const later = () => 'later';
  target.run = later;
  registry.dispose();
  assert.equal(target.run, later);
});
