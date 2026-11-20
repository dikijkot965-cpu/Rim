import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { DeviceLockService } from '../src/application/device-lock-service.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) };
}

test('device lock stores only a salted verifier, never the PIN', async () => {
  const storage = memoryStorage();
  const service = new DeviceLockService({ storage, cryptoRef: webcrypto, documentRef: null, windowRef: null, notify: () => {} });
  await service.configure('pin', '12345678', 5);
  const raw = storage.getItem('rim.device-lock.v1');
  assert.ok(raw);
  assert.equal(raw.includes('12345678'), false);
  assert.equal(JSON.parse(raw).mode, 'pin');
  assert.equal(await service.verify('12345678'), true);
});

test('device lock rejects wrong PIN and requires 8 digits', async () => {
  const service = new DeviceLockService({ storage: memoryStorage(), cryptoRef: webcrypto, documentRef: null, windowRef: null, notify: () => {} });
  await assert.rejects(() => service.configure('pin', '1234'), /8 до 16/);
  await service.configure('pin', '12345678');
  await assert.rejects(() => service.verify('87654321'), /Неверный/);
});

test('pattern lock requires six distinct nodes and accepts the configured sequence', async () => {
  const service = new DeviceLockService({ storage: memoryStorage(), cryptoRef: webcrypto, documentRef: null, windowRef: null, notify: () => {} });
  await assert.rejects(() => service.configure('pattern', '112233'), /6 разных/);
  await service.configure('pattern', '123578');
  assert.equal(await service.verify('123578'), true);
  await assert.rejects(() => service.verify('123579'), /Неверный/);
});

test('disabling device lock requires the current secret', async () => {
  const storage = memoryStorage();
  const service = new DeviceLockService({ storage, cryptoRef: webcrypto, documentRef: null, windowRef: null, notify: () => {} });
  await service.configure('pin', '12345678');
  await assert.rejects(() => service.remove('00000000'), /неверен/);
  await service.remove('12345678');
  assert.equal(storage.getItem('rim.device-lock.v1'), null);
});
