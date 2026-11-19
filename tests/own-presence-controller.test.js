import test from 'node:test';
import assert from 'node:assert/strict';
import { OwnPresenceController } from '../src/application/own-presence-controller.js';

test('own presence touch updates profile last_seen_at for current user', async () => {
  const calls = [];
  const client = {
    from(table) {
      assert.equal(table, 'profiles');
      return {
        update(payload) { calls.push(payload); return this; },
        eq(column, value) { calls.push([column, value]); return Promise.resolve({ error: null }); }
      };
    }
  };
  const controller = new OwnPresenceController({
    client,
    getUser: () => ({ id: 'u1' }),
    documentRef: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }
  });
  await controller.touch();
  assert.equal(calls[1][0], 'id');
  assert.equal(calls[1][1], 'u1');
  assert.ok(calls[0].last_seen_at);
  controller.dispose();
});

test('own presence start and stop clear interval', () => {
  const controller = new OwnPresenceController({
    client: { from() { return { update() { return this; }, eq() { return Promise.resolve({ error: null }); } }; } },
    getUser: () => ({ id: 'u1' }),
    intervalMs: 60000,
    documentRef: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }
  });
  controller.start();
  assert.ok(controller.timer);
  controller.stop();
  assert.equal(controller.timer, null);
  controller.dispose();
});
