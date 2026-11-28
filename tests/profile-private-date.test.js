import test from 'node:test';
import assert from 'node:assert/strict';
import { ProfileController } from '../src/application/profile-controller.js';

test('profile editor rejects future dates before making database writes', async () => {
  const values = { editUsername: 'admiral', editDisplayName: 'Адмирал', editBio: '', editNameColor: '#c9a45d', editBirthDate: '2099-01-01' };
  const controller = new ProfileController({
    client: { from() { throw new Error('Database must not be called for invalid dates'); } },
    getUser: () => ({ id: 'u1' }),
    documentRef: { getElementById: id => id === 'avatarFile' ? { files: [] } : { value: values[id] } }
  });
  const result = await controller.saveFromDom();
  assert.equal(result.ok, false);
  assert.match(result.error.message, /дату рождения/);
});
