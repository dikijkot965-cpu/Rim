import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSignalProtocolClient } from '@open-e2ee/signal-protocol-sdk';
import { inMemoryStore } from '@open-e2ee/signal-protocol-sdk/local/store/memory';
import { webSqliteStore } from '@open-e2ee/signal-protocol-sdk/local/store/web-sqlite';

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

test('OpenE2EE SDK and its browser storage dependencies are installed at pinned versions', () => {
  assert.equal(packageJson.dependencies['@open-e2ee/signal-protocol-sdk'], '14.7.0');
  assert.equal(packageJson.dependencies.idb, '8.0.3');
  assert.equal(packageJson.devDependencies.esbuild, '0.27.0');
  assert.equal(lock.packages['node_modules/@open-e2ee/signal-protocol-sdk'].version, '14.7.0');
  assert.ok(lock.packages['node_modules/@open-e2ee/signal-protocol-sdk'].integrity.startsWith('sha512-'));
});

test('Installed Signal SDK creates a strict post-quantum client with its public API', async () => {
  // In-memory storage is deliberately used only as a local API smoke test.
  // It is not the production store and does not claim at-rest protection.
  const client = await createSignalProtocolClient({
    identity: { userId: 'rim-sdk-installation-smoke-test' },
    adapters: { storage: inMemoryStore() },
    protocol: { postQuantum: 'required', braid: 'required' }
  });
  try {
    assert.equal(typeof client.send, 'function');
    assert.equal(typeof client.startRelaySubscription, 'function');
    assert.equal(typeof client.syncToServer, 'function');
  } finally {
    await client.stop?.();
    await client.close?.();
  }
});

test('SDK browser SQLite worker and Wasm are emitted as same-origin assets', () => {
  const build = fs.readFileSync(new URL('../scripts/build-cloudflare.mjs', import.meta.url), 'utf8');
  const runtime = fs.readFileSync(new URL('../src/security/e2e/signal-protocol-runtime.js', import.meta.url), 'utf8');
  const headers = fs.readFileSync(new URL('../scripts/build-cloudflare.mjs', import.meta.url), 'utf8');
  assert.match(build, /dist\/local\/store\/sqlite\/web/);
  assert.match(build, /sqlite-worker\.js/);
  assert.match(build, /sqlite3\.wasm/);
  assert.match(runtime, /workerUrl: new URL\('\.\/e2e\/sqlite-worker\.js', import\.meta\.url\)/);
  assert.match(runtime, /wasmUrl: new URL\('\.\/e2e\/sqlite3\.wasm', import\.meta\.url\)/);
  assert.match(headers, /\/assets\/js\/e2e\/\*\.js/);
  assert.match(headers, /\/assets\/js\/e2e\/\*\.wasm/);
  assert.match(headers, /Content-Type: application\/wasm/);
});

test('Installed browser SQLite adapter reports the documented OPFS_UNAVAILABLE code outside a browser', async () => {
  await assert.rejects(
    () => webSqliteStore({ name: 'rim-node-opfs-smoke.db', encryptionAtRest: true }),
    error => error?.code === 'OPFS_UNAVAILABLE'
  );
});
