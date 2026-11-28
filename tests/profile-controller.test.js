import test from 'node:test';
import assert from 'node:assert/strict';
import { ProfileController } from '../src/application/profile-controller.js';

test('saveFromDom validates username', async () => {
  const documentRef = {
    getElementById(id) {
      if (id === 'editUsername') return { value: 'ab' };
      if (id === 'editDisplayName') return { value: 'Name' };
      if (id === 'editBio') return { value: '' };
      if (id === 'editNameColor') return { value: '#fff' };
      if (id === 'avatarFile') return { files: [] };
      return null;
    }
  };
  const controller = new ProfileController({
    client: {},
    getUser: () => ({ id: 'u1' }),
    documentRef
  });
  const result = await controller.saveFromDom();
  assert.equal(result.ok, false);
});

test('saveFromDom updates profile row', async () => {
  const calls = [];
  const documentRef = {
    getElementById(id) {
      if (id === 'editUsername') return { value: 'admiral' };
      if (id === 'editDisplayName') return { value: 'Адмирал' };
      if (id === 'editBio') return { value: 'bio' };
      if (id === 'editNameColor') return { value: '#c9a45d' };
      if (id === 'avatarFile') return { files: [] };
      return null;
    }
  };
  const controller = new ProfileController({
    client: {
      from(table) {
        return {
          upsert(payload, options) { calls.push(['upsert', table, payload, options]); return Promise.resolve({ error: null }); },
          update(payload) {
            calls.push(['update', table, payload]);
            return {
              eq() {
                return {
                  select() {
                    return {
                      single: async () => ({
                        data: { id: 'u1', username: 'admiral', display_name: 'Адмирал' },
                        error: null
                      })
                    };
                  }
                };
              }
            };
          }
        };
      }
    },
    getUser: () => ({ id: 'u1' }),
    getProfile: () => ({ id: 'u1' }),
    setProfile: p => calls.push(['set', p.username]),
    closeModal: () => calls.push('close'),
    notify: () => {},
    documentRef
  });
  const result = await controller.saveFromDom();
  assert.equal(result.ok, true);
  assert.ok(calls.some(c => c[0] === 'update' && c[1] === 'profiles'));
  assert.ok(calls.some(c => c[0] === 'upsert' && c[1] === 'profile_private_details'));
  assert.ok(calls.includes('close'));
});
