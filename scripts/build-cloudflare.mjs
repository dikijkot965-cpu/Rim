import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const pagesOutput = path.join(root, 'cloudflare-pages');
const publicEntries = ['index.html', 'manifest.json', 'service-worker.js', 'icons', 'assets', 'src'];
const forbiddenPublicEntries = ['supabase', 'tests', 'docs', 'sql', 'scripts', 'package.json', 'wrangler.jsonc', 'README.md'];

function fail(message) {
  console.error(`[cloudflare-build] ERROR: ${message}`);
  process.exitCode = 1;
}

for (const entry of publicEntries) {
  if (!fs.existsSync(path.join(root, entry))) fail(`Required public entry is missing: ${entry}`);
}
if (process.exitCode) process.exit(1);

for (const target of [output, pagesOutput]) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  for (const entry of publicEntries) {
    fs.cpSync(path.join(root, entry), path.join(target, entry), { recursive: true });
  }
}

// Cloudflare Pages deployment root: deliberately contains static assets only.
// It must never contain wrangler config, package manifests, TypeScript or Supabase functions.
fs.writeFileSync(path.join(pagesOutput, '_headers'), [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  X-Frame-Options: DENY',
  '  Permissions-Policy: camera=(self), microphone=(self), geolocation=()',
  '',
  '/assets/*',
  '  Cache-Control: public, max-age=3600',
  ''
].join('\n'));


const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
const localRefs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
  .map(match => match[1])
  .filter(value => !/^(?:https?:|data:|mailto:|tel:|#|\/)/i.test(value));
for (const ref of localRefs) {
  const clean = ref.split(/[?#]/, 1)[0];
  if (clean && !fs.existsSync(path.join(output, clean))) fail(`Broken local reference in index.html: ${ref}`);
}

for (const entry of forbiddenPublicEntries) {
  if (fs.existsSync(path.join(output, entry))) fail(`Server/build-only entry leaked into dist: ${entry}`);
}

const files = [];
function walk(directory, prefix = '') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, relative);
    else files.push(relative);
  }
}
walk(output);
const pagesFiles = [];
walkPages(pagesOutput);
function walkPages(directory, prefix = '') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walkPages(absolute, relative);
    else pagesFiles.push(relative);
  }
}
if (!files.includes('index.html') || !pagesFiles.includes('index.html')) fail('dist/index.html was not generated');
if (files.some(file => /(^|\/)(?:\.env(?:\..*)?|\.dev\.vars.*|service[_-]?role|.*secret.*)$/i.test(file))) {
  fail('Potential secret-bearing file detected in public output');
}
if (pagesFiles.some(file => /\.(?:ts|tsx|jsonc?)$/i.test(file) && !['manifest.json'].includes(file))) fail('Cloudflare Pages output contains a non-static source/config file');
if (['wrangler.jsonc', 'package.json', 'supabase', 'tests', 'docs', 'scripts'].some(entry => fs.existsSync(path.join(pagesOutput, entry)))) fail('Cloudflare Pages output contains build/server-only files');
if (process.exitCode) process.exit(1);

console.log(`[cloudflare-build] Built ${files.length} Worker assets into dist/`);
console.log(`[cloudflare-build] Built ${pagesFiles.length} Pages-only files into cloudflare-pages/`);
console.log('[cloudflare-build] Pages root contains only HTML, CSS, JS, images, icons, manifest and _headers.');
