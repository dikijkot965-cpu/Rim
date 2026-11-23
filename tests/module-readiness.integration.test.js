import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bootstrap = fs.readFileSync(path.join(root, 'assets/js/rim-runtime-bootstrap.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('authenticated bootstrap waits for modular chat entrypoints before initialization', () => {
  assert.match(bootstrap, /__RIM_APP_MODULES_READY_PROMISE/);
  assert.match(bootstrap, /async function waitForRimAppModulesReady\(/);
  assert.match(bootstrap, /async function initializeApp\(\)\{await waitForRimAppModulesReady\(\);/);
  assert.match(app, /window\.__rimMarkAppModulesReady\?\.\(\);/);
  assert.ok(app.indexOf('window.__rimMarkAppModulesReady?.();') < app.indexOf("window.dispatchEvent(new CustomEvent('rim:ready'"));
});

test('repository root loads the dependency-bundled app entrypoint', () => {
  assert.match(html, /assets\/js\/rim-app\.bundle\.js/);
  assert.doesNotMatch(html, /<script type="module" src="\.\/src\/app\.js"><\/script>/);
});
