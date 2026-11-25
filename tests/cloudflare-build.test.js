import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const pages = path.join(root, 'cloudflare-pages');

test('Cloudflare build emits only public RIM client assets', () => {
  execFileSync(process.execPath, ['scripts/build-cloudflare.mjs'], { cwd: root, stdio: 'pipe' });
  assert.ok(fs.existsSync(path.join(dist, 'index.html')));
  assert.ok(fs.existsSync(path.join(dist, 'src/app.js')));
  assert.ok(fs.existsSync(path.join(dist, 'assets/css/rim.css')));
  assert.ok(fs.existsSync(path.join(dist, 'manifest.json')));
  const appBundle = path.join(dist, 'assets/js/rim-app.bundle.js');
  assert.ok(fs.existsSync(appBundle), 'the browser app entry bundle must exist');
  assert.ok(fs.statSync(appBundle).size < 2 * 1024 * 1024,
    'the initial app bundle must stay below 2 MiB; heavy on-demand SDK code belongs in split chunks');
  const appChunks = path.join(dist, 'assets/js/chunks');
  assert.ok(fs.existsSync(appChunks) && fs.readdirSync(appChunks).length > 0,
    'dynamic imports must be emitted as separately loadable ESM chunks');
  assert.ok(fs.existsSync(path.join(pages, 'index.html')));
  assert.ok(fs.existsSync(path.join(pages, '_headers')));
  for (const privateEntry of ['supabase', 'tests', 'docs', 'sql', 'scripts', 'package.json', 'wrangler.jsonc']) {
    assert.equal(fs.existsSync(path.join(dist, privateEntry)), false, `${privateEntry} must not be deployed as a public asset`);
  }
  const publicFiles = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else publicFiles.push(file);
    }
  };
  walk(dist);
  assert.ok(publicFiles.length > 100, 'expected the full modular client to be included');
  assert.equal(publicFiles.some(file => file.endsWith('.ts')), false, 'TypeScript server functions must not leak into the static bundle');
  for (const privateEntry of ['supabase', 'tests', 'docs', 'scripts', 'package.json', 'wrangler.jsonc']) {
    assert.equal(fs.existsSync(path.join(pages, privateEntry)), false, `${privateEntry} must not exist in the Pages upload root`);
  }
  const pagesFiles = [];
  const walkPages = dir => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) walkPages(file); else pagesFiles.push(file); } };
  walkPages(pages);
  assert.ok(pagesFiles.length > 100);
  assert.equal(pagesFiles.some(file => /\.(?:ts|tsx|jsonc?)$/i.test(file) && !file.endsWith('manifest.json')), false, 'Pages upload root must contain no TypeScript or Wrangler config');
});

test('Wrangler config points at the generated static asset directory', () => {
  const config = fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8');
  assert.match(config, /"name"\s*:\s*"rim-messenger"/);
  assert.match(config, /"directory"\s*:\s*"\.\/dist"/);
});

test('package scripts provide separate Cloudflare build and deploy commands', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['build:cloudflare'], 'node scripts/build-cloudflare.mjs');
  assert.equal(pkg.scripts['deploy:cloudflare'], 'npm run deploy:worker');
  assert.match(pkg.scripts['deploy:worker'], /build:cloudflare.*deploy:wrangler/);
  assert.match(pkg.scripts['deploy:wrangler'], /wrangler@4\.165\.0 deploy/);
  assert.equal(pkg.scripts['build:pages'], 'npm run build:cloudflare');
});
