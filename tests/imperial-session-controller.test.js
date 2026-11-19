import test from 'node:test';
import assert from 'node:assert/strict';
import { ImperialSessionController } from '../src/application/imperial-session-controller.js';

test('loadRole marks superadmin as imperator', async () => {
  const windowRef = {};
  const controller = new ImperialSessionController({
    client: {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: { role: 'superadmin' }, error: null })
        };
      }
    },
    getUser: () => ({ id: 'u1' }),
    windowRef
  });
  await controller.loadRole();
  assert.equal(controller.isImperator(), true);
  assert.equal(windowRef.IMPERIAL_FEATURES.admin, true);
  controller.dispose();
});

test('loadRole keeps non-admin false', async () => {
  const controller = new ImperialSessionController({
    client: {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: { role: 'user' }, error: null })
        };
      }
    },
    getUser: () => ({ id: 'u1' }),
    windowRef: {}
  });
  await controller.loadRole();
  assert.equal(controller.isImperator(), false);
});
