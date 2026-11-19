import test from 'node:test';
import assert from 'node:assert/strict';
import { PrivacySettingsService } from '../src/application/privacy-settings-service.js';

test('saveFromDom writes local preferences', async () => {
  const store = {};
  const service = new PrivacySettingsService({
    client: {
      from() {
        return {
          upsert: async () => ({ error: null }),
          update() { return { eq: async () => ({ error: null }) }; }
        };
      }
    },
    getUser: () => ({ id: 'u1' }),
    storage: {
      getItem(key) { return store[key] || null; },
      setItem(key, value) { store[key] = value; }
    },
    notify: () => {}
  });
  const result = await service.saveFromDom({ showOnline: false, allowForward: true, showRead: false });
  assert.equal(result.ok, true);
  const local = JSON.parse(store.rim_privacy_preferences_v1);
  assert.equal(local.showOnline, false);
  assert.equal(local.showRead, false);
});
