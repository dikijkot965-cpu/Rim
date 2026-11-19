import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { escapeHtml, escapeAttr } from '../src/core/html.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('escapeHtml neutralizes tags and quotes', () => {
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(escapeAttr('"onclick='), '&quot;onclick=');
});

test('shell and navigation escape titles', () => {
  const shell = readFileSync(join(root, 'src/application/shell-page-controller.js'), 'utf8');
  const nav = readFileSync(join(root, 'src/application/navigation-pages-controller.js'), 'utf8');
  assert.match(shell, /escapeHtml\(title\)/);
  assert.match(nav, /escapeHtml\(title\)/);
  assert.match(nav, /escapeHtml\(it\.title\)/);
});

test('audit script reports risk classes', () => {
  const audit = readFileSync(join(root, 'scripts/audit-innerhtml.mjs'), 'utf8');
  assert.match(audit, /risk/);
  assert.match(audit, /escapeHtml/);
});
