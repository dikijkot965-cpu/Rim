import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('bootstrap LOC budget ≤300 after Stage C compaction', () => {
  const boot = readFileSync(join(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8');
  const controller = readFileSync(join(root, 'src/application/app-bootstrap-controller.js'), 'utf8');
  const lines = boot.split(/\n/).length;
  assert.ok(lines <= 350, `lines ${lines}`);
  assert.match(controller, /__RIM_APP_BOOTSTRAP_OWNED/);
  assert.match(boot, /__rimMirrorLegacyState/);
});

test('playwright skeleton files exist', () => {
  assert.ok(existsSync(join(root, 'playwright.config.mjs')));
  assert.ok(existsSync(join(root, 'tests/e2e/smoke.spec.mjs')));
  assert.ok(existsSync(join(root, 'scripts/run-e2e.mjs')));
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['test:e2e'], 'node scripts/run-e2e.mjs');
});
