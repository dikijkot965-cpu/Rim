import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bootstrap = readFileSync(new URL('../assets/js/rim-runtime-bootstrap.js', import.meta.url), 'utf8');

test('module readiness does not reject a slow but still-loading application after a fixed timeout', () => {
  assert.match(bootstrap, /async function waitForRimAppModulesReady\(\)\s*\{/);
  assert.match(bootstrap, /await promise;/);
  assert.doesNotMatch(bootstrap, /setTimeout\(\(\)\s*=>\s*resolve\(false\),\s*timeoutMs\)/);
  assert.doesNotMatch(bootstrap, /не загрузились за 20 секунд/i);
});

test('module readiness propagates app bundle and split-chunk failures instead of hiding them as timeouts', () => {
  assert.match(bootstrap, /window\.__rimFailAppModules\s*=\s*reason\s*=>/);
  assert.match(bootstrap, /window\.addEventListener\('error'/);
  assert.ok(bootstrap.includes('rim-app\\\\.bundle\\\\.js'));
  assert.ok(bootstrap.includes('\\\\/chunks\\\\/'));
  assert.match(bootstrap, /Не удалось запустить модули RIM:/);
});
