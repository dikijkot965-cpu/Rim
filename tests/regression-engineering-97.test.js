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

test('supabase CDN is pinned to an exact version', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.match(html, /@supabase\/supabase-js@2\.\d+\.\d+/);
  assert.doesNotMatch(html, /supabase-js@2"/);
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
  assert.match(status, /iteration\.97|4\.0\.0-iteration\.12[2345]/);
  assert.match(status, /not loaded/i);
});

test('app.js does not pass duplicate client to shell', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  assert.doesNotMatch(app, /bindShellSurface\(\{\s*client:[^}]*client:/);
});
