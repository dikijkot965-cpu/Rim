import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthFormController } from '../src/application/auth-form-controller.js';

function fixture({ signInResult, onSignedIn = async () => {} } = {}) {
  const elements = {
    authEmail: { value: 'person@example.com' },
    authPassword: { value: 'correct-horse-battery' },
    authStatus: { textContent: '' },
    loginBtn: { disabled: false }
  };
  const mirrored = [];
  const win = {
    location: { href: 'https://dikijkot965-cpu.github.io/Rim/', origin: 'https://dikijkot965-cpu.github.io', pathname: '/Rim/', hostname: 'dikijkot965-cpu.github.io', assign() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    __RIM_SET_CURRENT_USER(user) { mirrored.push(user); }
  };
  const controller = new AuthFormController({
    client: { auth: { async signInWithPassword() { return signInResult; } } },
    documentRef: { getElementById(id) { return elements[id] || null; } },
    windowRef: win,
    onSignedIn
  });
  return { controller, elements, mirrored, win };
}

test('email sign-in mirrors the authenticated user into the classic runtime before app initialization', async () => {
  const user = { id: 'user-123', email: 'person@example.com' };
  let initializedWith = null;
  const f = fixture({ signInResult: { data: { user }, error: null }, onSignedIn: async u => { initializedWith = u; } });
  const result = await f.controller.signIn();
  assert.equal(result.ok, true);
  assert.equal(f.win.currentUser, user);
  assert.deepEqual(f.mirrored, [user]);
  assert.equal(initializedWith, user);
  assert.equal(f.elements.loginBtn.disabled, false);
  assert.match(f.elements.authStatus.textContent, /готов к работе/);
});

test('email sign-in reports thrown network failures and releases the login button', async () => {
  const f = fixture({ signInResult: Promise.reject(new Error('network unavailable')) });
  const result = await f.controller.signIn();
  assert.equal(result.ok, false);
  assert.match(f.elements.authStatus.textContent, /network unavailable/);
  assert.equal(f.elements.loginBtn.disabled, false);
});
