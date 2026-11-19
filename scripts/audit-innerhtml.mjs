#!/usr/bin/env node
/**
 * Inventory of innerHTML assignments under src/ and assets/js (non-legacy).
 * Flags interpolations that do not call escape helpers within a small context window.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const roots = ['src', 'assets/js'];
const hits = [];
const SAFE = /escapeHtml|escapeAttr|escapeJsString|escHtml|\.escape\(|sanitizeHtml|CSS\.escape/;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'legacy' || name === 'node_modules') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(js|mjs)$/.test(name)) scan(p);
  }
}

function scan(file) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\n/);
  lines.forEach((line, i) => {
    if (!/innerHTML\s*=/.test(line) && !/\.innerHTML\s*\+=/.test(line)) return;
    const window = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 4)).join('\n');
    const hasInterp = /\$\{/.test(window);
    const escaped = SAFE.test(window);
    const risk = hasInterp && !escaped ? 'review' : (hasInterp ? 'ok' : 'static');
    hits.push({
      file: relative(process.cwd(), file),
      line: i + 1,
      risk,
      snippet: line.trim().slice(0, 160)
    });
  });
}

for (const root of roots) {
  try { walk(root); } catch { /* missing */ }
}

const review = hits.filter(h => h.risk === 'review');
console.log(`innerHTML sites: ${hits.length} (review: ${review.length}, ok: ${hits.filter(h => h.risk === 'ok').length}, static: ${hits.filter(h => h.risk === 'static').length})`);
for (const h of hits) {
  console.log(`${h.risk.toUpperCase()}\t${h.file}:${h.line}: ${h.snippet}`);
}
process.exitCode = 0;
