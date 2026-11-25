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
  await service.configure('pin', '1234', 5);
  const raw = storage.getItem('rim.device-lock.v1');
  assert.ok(raw);
  const persisted = JSON.parse(raw);
  assert.equal(Object.values(persisted).includes('1234'), false, 'the PIN must not be persisted as a field value');
  assert.equal(Object.hasOwn(persisted, 'pin'), false, 'the raw PIN must never be stored');
  assert.equal(persisted.mode, 'pin');
  assert.equal(await service.verify('1234'), true);
});

test('device lock rejects wrong PIN and requires exactly four digits', async () => {
  const service = new DeviceLockService({ storage: memoryStorage(), cryptoRef: webcrypto, documentRef: null, windowRef: null, notify: () => {} });
  await assert.rejects(() => service.configure('pin', '123'), /ровно 4 цифры/);
  await service.configure('pin', '1234');
  await assert.rejects(() => service.verify('4321'), /Неверный/);
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
  await service.configure('pin', '1234');
  await assert.rejects(() => service.remove('0000'), /Неверный/);
  await service.remove('1234');
  assert.equal(storage.getItem('rim.device-lock.v1'), null);
});


test('four digit lock enforces progressive local retry delay after repeated failures', async () => {
  const storage = memoryStorage();
  const service = new DeviceLockService({ storage, cryptoRef: webcrypto, documentRef: null, windowRef: null, notify: () => {} });
  await service.configure('pin', '2468', 5);
  for (let i = 0; i < 3; i++) await assert.rejects(() => service.verify('0000'), /Неверный/);
  await assert.rejects(() => service.verify('0000'), /через 30 сек/);
  assert.ok(JSON.parse(storage.getItem('rim.device-lock.v1')).blockedUntil > Date.now());
});

test('short background return respects grace period; zero disables automatic lock', () => {
  const service = new DeviceLockService({ storage: memoryStorage(), cryptoRef: webcrypto, documentRef: null, windowRef: null, notify: () => {} });
  service.config = { autoLockMinutes: 5 };
  assert.equal(service.shouldLockSince(Date.now() - 10_000), false);
  assert.equal(service.shouldLockSince(Date.now() - 6 * 60_000), true);
  service.config.autoLockMinutes = 0;
  assert.equal(service.shouldLockSince(Date.now() - 24 * 60 * 60_000), false);
});

test('changing an existing PIN requires the current PIN', async () => {
  const service = new DeviceLockService({ storage: memoryStorage(), cryptoRef: webcrypto, documentRef: null, windowRef: null, notify: () => {} });
  await service.configure('pin', '1357');
  await assert.rejects(() => service.configure('pin', '2468', 5), /Неверный/);
  await service.configure('pin', '2468', 5, '1357');
  assert.equal(await service.verify('2468'), true);
});

test('legacy eight digit PIN remains usable until the user changes it', async () => {
  const storage = memoryStorage();
  const service = new DeviceLockService({ storage, cryptoRef: webcrypto, documentRef: null, windowRef: null, notify: () => {} });
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const verifier = await service.derive('pin:12345678', salt);
  storage.setItem('rim.device-lock.v1', JSON.stringify({ version: 1, mode: 'pin', salt: Array.from(salt, b => b.toString(16).padStart(2,'0')).join(''), verifier, autoLockMinutes: 1 }));
  const legacy = new DeviceLockService({ storage, cryptoRef: webcrypto, documentRef: null, windowRef: null, notify: () => {} });
  assert.equal(legacy.config.pinLength, 0);
  assert.equal(await legacy.verify('12345678'), true);
});
