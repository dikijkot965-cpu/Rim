import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
test('index.html has zero assets/js/legacy script tags', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /<script[^>]+src="assets\/js\/legacy\//);
  assert.match(html, /rim-runtime-bootstrap\.js/);
});
test('rim-runtime-bootstrap exists and mirrors state for bridge', () => {
  assert.equal(existsSync(join(root, 'assets/js/rim-runtime-bootstrap.js')), true);
  const boot = readFileSync(join(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8');
  assert.match(boot, /createClient/);
  assert.match(boot, /__rimMirrorLegacyState/);
  assert.match(boot, /initializeApp/);
});
