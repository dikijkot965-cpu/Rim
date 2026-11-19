import test from 'node:test';
import assert from 'node:assert/strict';
import { AppearancePreferencesService } from '../src/application/appearance-preferences-service.js';

test('applyTheme sets body dataset and stores local value', () => {
  const store = {};
  const body = { dataset: {} };
  const meta = { content: '', setAttribute(_, v) { this.content = v; } };
  const service = new AppearancePreferencesService({
    client: {},
    getUser: () => null,
    documentRef: {
      body,
      querySelector: () => meta,
      getElementById: () => null
    },
    windowRef: {},
    storage: {
      getItem: k => store[k] || null,
      setItem: (k, v) => { store[k] = v; }
    }
  });
  assert.equal(service.applyTheme('halloween-imperial'), 'halloween-imperial');
  assert.equal(body.dataset.theme, 'halloween-imperial');
  assert.equal(store.rim_theme, 'halloween-imperial');
  assert.equal(meta.content, '#100d19');
});

test('saveSettings aliases halloween-imperial for database', async () => {
  const calls = [];
  const service = new AppearancePreferencesService({
    client: {
      from() {
        return {
          upsert: async payload => { calls.push(payload); return { error: null }; }
        };
      }
    },
    getUser: () => ({ id: 'u1' }),
    windowRef: { currentTheme: 'halloween-imperial', currentLanguage: 'ru' },
    storage: { getItem: () => 'halloween-imperial', setItem() {} },
    documentRef: { body: { dataset: {} }, querySelector: () => null, getElementById: () => null }
  });
  const result = await service.saveSettings();
  assert.equal(result.ok, true);
  assert.equal(calls[0].theme, 'halloween');
});
