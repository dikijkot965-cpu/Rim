import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('E2E scope repository is resolved from the DI container before composed surfaces use it', () => {
  const factory = app.indexOf("container.factory('e2eScopeRepository'");
  const resolution = app.indexOf("const e2eScopeRepository = container.get('e2eScopeRepository')");
  const socialInjection = app.indexOf('e2eScopeRepository,');
  const chatRuntimeInjection = app.indexOf('e2eScopeRepository,', socialInjection + 1);

  assert.ok(factory >= 0, 'E2E scope repository factory must be registered');
  assert.ok(resolution > factory, 'the factory must be resolved into a local binding');
  assert.ok(socialInjection > resolution, 'social surface must receive the resolved repository');
  assert.ok(chatRuntimeInjection > socialInjection, 'chat runtime must receive the same resolved repository');
  assert.doesNotMatch(app.slice(0, resolution), /\be2eScopeRepository\s*=/, 'no duplicate or premature local binding');
});
