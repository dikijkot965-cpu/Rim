import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { TelegramAuthService, TELEGRAM_AUTH_STORAGE_KEY } from '../src/application/telegram-auth-service.js';

function makeWindow(url = 'https://rim.example/index.html') {
  const values = new Map();
  const assigned = [];
  return {
    crypto: webcrypto,
    location: { href: url, origin: 'https://rim.example', pathname: '/index.html', hostname: 'rim.example', assign(value) { assigned.push(value); } },
    sessionStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) },
    history: { replaceState(_state, _title, next) { this.lastUrl = next; } },
    assigned,
    values
  };
}

test('Telegram OIDC start uses PKCE S256, state and nonce', async () => {
  const win = makeWindow();
  const service = new TelegramAuthService({ client: { auth: {} }, windowRef: win, fetchRef: async () => {} });
  await service.start();
  const target = new URL(win.assigned[0]);
  assert.equal(target.origin, 'https://oauth.telegram.org');
  assert.equal(target.pathname, '/auth');
  assert.equal(target.searchParams.get('client_id'), '9041438103');
  assert.equal(target.searchParams.get('response_type'), 'code');
  assert.equal(target.searchParams.get('prompt'), 'login');
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(target.searchParams.get('state'));
  assert.ok(target.searchParams.get('nonce'));
  assert.ok(target.searchParams.get('code_challenge'));
  assert.ok(win.values.has(TELEGRAM_AUTH_STORAGE_KEY));
});

test('Telegram callback exchanges code and verifies one-time Supabase OTP', async () => {
  const win = makeWindow('https://rim.example/index.html?code=auth-code-123456&state=expected-state');
  win.sessionStorage.setItem(TELEGRAM_AUTH_STORAGE_KEY, JSON.stringify({
    state: 'expected-state', nonce: 'nonce-value-which-is-long-enough', verifier: 'v'.repeat(48),
    redirectUri: 'https://rim.example/index.html', createdAt: Date.now()
  }));
  let exchanged = false;
  let verified = false;
  const client = {
    supabaseUrl: 'https://project.supabase.co',
    rest: { headers: { apikey: 'sb_publishable_test' } },
    auth: { async verifyOtp(payload) { verified = payload.type === 'magiclink' && payload.token_hash === 'hash-once'; return { data: { user: { id: 'u1' }, session: { access_token: 'token' } }, error: null }; } }
  };
  const service = new TelegramAuthService({
    client, windowRef: win,
    fetchRef: async (url, options) => {
      exchanged = url.endsWith('/functions/v1/telegram-auth') && options.headers.apikey === 'sb_publishable_test';
      const body = JSON.parse(options.body);
      assert.equal(body.code, 'auth-code-123456');
      assert.equal(body.nonce, 'nonce-value-which-is-long-enough');
      return { ok: true, async json() { return { token_hash: 'hash-once' }; } };
    }
  });
  const result = await service.handleCallback();
  assert.equal(result.handled, true);
  assert.equal(result.ok, true);
  assert.equal(result.user.id, 'u1');
  assert.equal(exchanged, true);
  assert.equal(verified, true);
  assert.equal(win.sessionStorage.getItem(TELEGRAM_AUTH_STORAGE_KEY), null);
});

test('Telegram callback rejects state mismatch before contacting backend', async () => {
  const win = makeWindow('https://rim.example/index.html?code=auth-code-123456&state=wrong');
  win.sessionStorage.setItem(TELEGRAM_AUTH_STORAGE_KEY, JSON.stringify({
    state: 'right', nonce: 'nonce', verifier: 'v'.repeat(48), redirectUri: 'https://rim.example/index.html', createdAt: Date.now()
  }));
  let calls = 0;
  const service = new TelegramAuthService({ client: { supabaseUrl: 'https://project.supabase.co', rest: { headers: { apikey: 'x' } }, auth: {} }, windowRef: win, fetchRef: async () => { calls += 1; } });
  const result = await service.handleCallback();
  assert.equal(result.ok, false);
  assert.match(result.error.message, /state/);
  assert.equal(calls, 0);
});


test('GitHub Pages host uses canonical public redirect URI', async () => {
  const values = new Map();
  const assigned = [];
  const win = {
    crypto: webcrypto,
    location: {
      href: 'https://dikijkot965-cpu.github.io/Rim/',
      origin: 'https://dikijkot965-cpu.github.io',
      pathname: '/Rim/',
      hostname: 'dikijkot965-cpu.github.io',
      assign(value) { assigned.push(value); }
    },
    sessionStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key)
    },
    document: { querySelector: () => null }
  };
  const service = new TelegramAuthService({ client: { auth: {} }, windowRef: win, fetchRef: async () => {} });
  await service.start();
  const target = new URL(assigned[0]);
  assert.equal(target.searchParams.get('redirect_uri'), 'https://dikijkot965-cpu.github.io/Rim/');
  const pending = JSON.parse(values.get(TELEGRAM_AUTH_STORAGE_KEY));
  assert.equal(pending.redirectUri, 'https://dikijkot965-cpu.github.io/Rim/');
});


test('Telegram callback invokes the browser Window.fetch with its required receiver', async () => {
  const win = makeWindow('https://rim.example/index.html?code=auth-code-123456&state=expected-state');
  win.sessionStorage.setItem(TELEGRAM_AUTH_STORAGE_KEY, JSON.stringify({
    state: 'expected-state', nonce: 'nonce-value-which-is-long-enough', verifier: 'v'.repeat(48),
    redirectUri: 'https://rim.example/index.html', createdAt: Date.now()
  }));
  let fetchReceiver = null;
  win.fetch = async function(url, options) {
    fetchReceiver = this;
    assert.ok(url.endsWith('/functions/v1/telegram-auth'));
    return { ok: true, async json() { return { token_hash: 'hash-once' }; } };
  };
  const client = {
    supabaseUrl: 'https://project.supabase.co',
    rest: { headers: { apikey: 'sb_publishable_test' } },
    auth: { async verifyOtp() { return { data: { user: { id: 'u1' }, session: { access_token: 'token' } }, error: null }; } }
  };
  const result = await new TelegramAuthService({ client, windowRef: win }).handleCallback();
  assert.equal(result.ok, true);
  assert.equal(fetchReceiver, win, 'Window.fetch must be called with window as its receiver');
});
