import test from 'node:test';
import assert from 'node:assert/strict';
import { installAuthEntrypoint } from '../src/application/auth-entrypoint.js';

function fixture() {
  const elements = {
    authEmail: { value: 'person@example.com' },
    authPassword: { value: 'correct-horse-battery' },
    authPasswordConfirm: { value: '' },
    authStatus: { textContent: '' },
    loginBtn: { disabled: false },
    registerBtn: { disabled: false },
    telegramAuthBtn: { disabled: false }
  };
  const user = { id: 'auth-user-178', email: 'person@example.com' };
  const calls = { signIn: 0, initialize: 0, mirrored: [] };
  const windowRef = {
    location: {
      href: 'https://dikijkot965-cpu.github.io/Rim/',
      origin: 'https://dikijkot965-cpu.github.io',
      pathname: '/Rim/',
      hostname: 'dikijkot965-cpu.github.io',
      assign() {}
    },
    history: { replaceState() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    __RIM_SET_CURRENT_USER(value) { calls.mirrored.push(value); this.currentUser = value; },
    async initializeApp() { calls.initialize += 1; },
    db: {
      auth: {
        async signInWithPassword(credentials) {
          calls.signIn += 1;
          assert.equal(credentials.email, 'person@example.com');
          assert.equal(credentials.password, 'correct-horse-battery');
          return { data: { user }, error: null };
        }
      }
    }
  };
  const documentRef = { getElementById(id) { return elements[id] || null; } };
  return { elements, windowRef, documentRef, calls, user };
}

test('auth entrypoint binds the existing email login button to AuthFormController', async () => {
  const f = fixture();
  const controller = installAuthEntrypoint({
    windowRef: f.windowRef,
    documentRef: f.documentRef,
    client: f.windowRef.db
  });

  assert.ok(controller);
  assert.equal(f.windowRef.__RIM_AUTH_FORM_READY, true);
  assert.equal(f.windowRef.__RIM_AUTH_FORM_OWNED, true);
  assert.equal(typeof f.windowRef.signIn, 'function');
  const result = await f.windowRef.signIn();

  assert.equal(result.ok, true);
  assert.equal(f.calls.signIn, 1);
  assert.equal(f.calls.initialize, 1);
  assert.deepEqual(f.calls.mirrored, [f.user]);
  assert.equal(f.windowRef.currentUser, f.user);
  assert.match(f.elements.authStatus.textContent, /Открываем RIM/);
});

test('auth entrypoint replaces the Telegram loading shim with the controller handler', () => {
  const f = fixture();
  installAuthEntrypoint({
    windowRef: f.windowRef,
    documentRef: f.documentRef,
    client: f.windowRef.db
  });

  assert.equal(typeof f.windowRef.signInWithTelegram, 'function');
  assert.equal(
    f.windowRef.__RIM_AUTH_FORM_SIGN_IN_WITH_TELEGRAM,
    f.windowRef.signInWithTelegram
  );
  assert.equal(f.windowRef.__RIM_AUTH_FORM_READY, true);
});
