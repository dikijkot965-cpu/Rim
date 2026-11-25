import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

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

// Build the initial browser entrypoint as a small minified ESM entry and keep
// dynamic imports in separate same-origin chunks. Without splitting, esbuild
// folds the on-demand Signal SDK imports into the initial app bundle, forcing
// every phone to parse several megabytes before the module-ready barrier clears.
// The static fallback keeps the legacy build usable when dev dependencies are absent.
let bundledApp = false;
try {
  const require = createRequire(import.meta.url);
  const esbuild = require('esbuild');
  esbuild.buildSync({
    entryPoints: [path.join(root, 'src/app.js')],
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
    outdir: path.join(output, 'assets/js'),
    entryNames: 'rim-app.bundle',
    chunkNames: 'chunks/[name]-[hash]',
    minify: true,
    loader: { '.wasm': 'file' },
    assetNames: '[name]-[hash]',
    legalComments: 'none',
    sourcemap: false
  });

  // The SDK starts SQLite in a dedicated module worker. Its worker and Wasm
  // are referenced by URL at runtime, so bundling src/app.js alone does not
  // emit them. Build the worker as a separate same-origin asset and preserve
  // the explicit URL contract passed by RimSignalProtocolRuntime.
  const sdkWebSqlite = path.join(root, 'node_modules/@open-e2ee/signal-protocol-sdk/dist/local/store/sqlite/web');
  const sdkWorker = path.join(sdkWebSqlite, 'worker.js');
  const sdkWasm = path.join(sdkWebSqlite, 'sqlite3mc/sqlite3.wasm');
  if (!fs.existsSync(sdkWorker) || !fs.existsSync(sdkWasm)) {
    throw new Error('Signal Protocol SDK browser SQLite worker/Wasm assets are missing from node_modules.');
  }
  const e2eAssets = path.join(output, 'assets/js/e2e');
  fs.mkdirSync(e2eAssets, { recursive: true });
  esbuild.buildSync({
    entryPoints: [sdkWorker],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
    outfile: path.join(e2eAssets, 'sqlite-worker.js'),
    minify: true,
    legalComments: 'none',
    sourcemap: false
  });
  fs.copyFileSync(sdkWasm, path.join(e2eAssets, 'sqlite3.wasm'));

  // Supabase Auth must not depend on a third-party CDN being reachable from
  // the user's browser. Bundle the pinned JS client as a same-origin classic
  // script consumed by rim-runtime-bootstrap.js.
  const supabaseEntry = path.join(root, 'scripts/supabase-browser-entry.js');
  if (!fs.existsSync(supabaseEntry)) throw new Error('Supabase browser bundle entry is missing.');
  esbuild.buildSync({
    entryPoints: [supabaseEntry],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2022'],
    outfile: path.join(output, 'assets/js/supabase-client.bundle.js'),
    minify: true,
    legalComments: 'none',
    sourcemap: false
  });

  // The auth controller is a separate, small browser entrypoint. The legacy
  // bootstrap defines the Supabase client and initializeApp first; this module
  // then binds the controller's globals to the actual login/register buttons.
  const authEntry = path.join(root, 'src/application/auth-entrypoint.js');
  if (!fs.existsSync(authEntry)) throw new Error('RIM auth entrypoint is missing.');
  esbuild.buildSync({
    entryPoints: [authEntry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
    outfile: path.join(output, 'assets/js/rim-auth-entrypoint.js'),
    minify: true,
    legalComments: 'none',
    sourcemap: false
  });

  fs.mkdirSync(path.join(pagesOutput, 'assets/js'), { recursive: true });
  // Copy the complete JS asset directory: esbuild may emit the OPFS worker
  // and the SQLite Wasm binary as separate same-origin assets.
  fs.cpSync(path.join(output, 'assets/js'), path.join(pagesOutput, 'assets/js'), { recursive: true });

  // GitHub Pages in this project publishes the repository root. Keep that
  // deployment path fully self-contained too: a source-only src/app.js entry
  // cannot resolve the SDK's pinned bare package imports in a browser.
  fs.mkdirSync(path.join(root, 'assets/js'), { recursive: true });
  fs.cpSync(path.join(output, 'assets/js'), path.join(root, 'assets/js'), { recursive: true });
  for (const target of [
    path.join(root, 'assets/js/rim-auth-entrypoint.js'),
    path.join(pagesOutput, 'assets/js/rim-auth-entrypoint.js')
  ]) {
    if (!fs.existsSync(target) || fs.statSync(target).size === 0) {
      throw new Error(`Generated auth entrypoint was not copied to the public target: ${target}`);
    }
  }
  for (const htmlFile of [path.join(root, 'index.html'), path.join(output, 'index.html'), path.join(pagesOutput, 'index.html')]) {
    const htmlText = fs.readFileSync(htmlFile, 'utf8').replace('./src/app.js', './assets/js/rim-app.bundle.js');
    fs.writeFileSync(htmlFile, htmlText);
  }
  bundledApp = true;
} catch (error) {
  if (error?.code !== 'MODULE_NOT_FOUND') throw error;
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
  '',
  '/assets/js/*',
  "  Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'",
  '',
  '/assets/js/e2e/*.js',
  "  Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'",
  '',
  '/assets/js/*.wasm',
  '  Content-Type: application/wasm',
  '',
  '/assets/js/e2e/*.wasm',
  '  Content-Type: application/wasm',
  ''
].join('\n'));


const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
const localRefs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
  .map(match => match[1])
  .filter(value => !/^(?:https?:|data:|mailto:|tel:|#|\/)/i.test(value) && !value.includes('${'));
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

console.log(`[cloudflare-build] Browser app bundle: ${bundledApp ? 'built with esbuild' : 'not built (install dependencies to bundle SDK imports)'}`);
console.log(`[cloudflare-build] Built ${files.length} Worker assets into dist/`);
console.log(`[cloudflare-build] Built ${pagesFiles.length} Pages-only files into cloudflare-pages/`);
console.log('[cloudflare-build] Pages root contains only HTML, CSS, JS, images, icons, manifest and _headers.');
