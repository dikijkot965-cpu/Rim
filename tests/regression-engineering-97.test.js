import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { escapeHtml, escapeAttr } from '../src/core/html.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('escapeHtml encodes control characters', () => {
  assert.equal(escapeHtml("<b>&\""), "&lt;b&gt;&amp;&quot;");
  assert.equal(escapeHtml("a'b"), "a&#39;b");
  assert.equal(escapeAttr('a"b'), 'a&quot;b');
});

test('Supabase JS is pinned and bundled as a same-origin browser asset', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies['@supabase/supabase-js'], '2.49.8');
  assert.match(html, /assets\/js\/supabase-client\.bundle\.js/);
  assert.doesNotMatch(html, /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/);
  assert.ok(existsSync(join(root, 'assets/js/supabase-client.bundle.js')), 'local Supabase bundle must be generated before tests');
});

test('primitives script loads before bootstrap', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const a = html.indexOf('assets/js/core/rim-primitives.js');
  const b = html.indexOf('assets/js/rim-runtime-bootstrap.js');
  assert.ok(a > -1, 'primitives path missing');
  assert.ok(b > a, 'primitives must precede bootstrap');
});

test('CURRENT_STATUS exists and claims iteration 97+', () => {
  const status = readFileSync(join(root, 'docs/CURRENT_STATUS.md'), 'utf8');
  assert.match(status, /iteration\.97|4\.0\.0-iteration\.12[0-9]|4\.1\.[0-9]+-iteration\.1[45][0-9]/);
  assert.match(status, /not loaded/i);
});

test('app.js does not pass duplicate client to shell', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  assert.doesNotMatch(app, /bindShellSurface\(\{\s*client:[^}]*client:/);
});
