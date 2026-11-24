/* RIM Telegram OIDC fallback. Self-contained so it also works in the Pages build, where src/ is not published. */
(() => {
  'use strict';
  const STORAGE_KEY = 'rim.telegram.oidc.v1';
  const CLIENT_ID = '9041438103';
  const AUTH_URL = 'https://oauth.telegram.org/auth';
  const EDGE_FUNCTION = 'telegram-auth';
  let processing = false;

  const status = message => {
    const node = document.getElementById('authStatus');
    if (node) node.textContent = String(message || '');
  };
  const normalizeUrl = value => {
    try {
      const url = new URL(String(value || '').trim());
      let path = url.pathname || '/';
      if (!path.endsWith('/') && !/\\.html?$/i.test(path)) path += '/';
      return url.origin + path;
    } catch { return ''; }
  };
  const redirectUri = () => {
    const host = String(window.location.hostname || '');
    if (host === 'dikijkot965-cpu.github.io' || host.endsWith('.github.io')) {
      return 'https://dikijkot965-cpu.github.io/Rim/';
    }
    return normalizeUrl(window.location.origin + (window.location.pathname || '/'));
  };
  const base64Url = bytes => {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '');
  };
  const randomToken = (cryptoRef, size = 32) => {
    const bytes = new Uint8Array(size);
    cryptoRef.getRandomValues(bytes);
    return base64Url(bytes);
  };
  async function start() {
    if (!window.db?.auth) throw new Error('Клиент Supabase ещё не готов. Обновите страницу.');
    const cryptoRef = window.crypto;
    if (!cryptoRef?.subtle || !cryptoRef?.getRandomValues) throw new Error('Для Telegram-входа откройте RIM по HTTPS в современном браузере.');
    if (!window.sessionStorage) throw new Error('Браузер заблокировал защищённое хранилище сессии.');
    const state = randomToken(cryptoRef);
    const nonce = randomToken(cryptoRef);
    const verifier = randomToken(cryptoRef, 48);
    const digest = await cryptoRef.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const challenge = base64Url(new Uint8Array(digest));
    const callback = redirectUri();
    if (!callback) throw new Error('Не удалось определить адрес возврата Telegram.');
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ state, nonce, verifier, redirectUri: callback, createdAt: Date.now() }));
    const url = new URL(AUTH_URL);
    url.search = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: callback,
      response_type: 'code',
      prompt: 'login',
      scope: 'openid profile',
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    }).toString();
    window.location.assign(url.toString());
  }
  async function handleCallback() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const providerError = url.searchParams.get('error');
    if (!code && !state && !providerError) return;
    if (processing) return;
    processing = true;
    try {
      const cleanUrl = new URL(redirectUri());
      window.history?.replaceState?.({}, '', cleanUrl.toString());
      if (providerError) throw new Error(url.searchParams.get('error_description') || 'Telegram отклонил вход.');
      const raw = window.sessionStorage?.getItem(STORAGE_KEY);
      window.sessionStorage?.removeItem(STORAGE_KEY);
      if (!raw) throw new Error('Сессия Telegram не найдена. Начните вход заново.');
      const pending = JSON.parse(raw);
      if (!state || state !== pending.state) throw new Error('Проверка state не пройдена.');
      if (!pending.createdAt || Date.now() - pending.createdAt > 600000) throw new Error('Запрос Telegram устарел. Начните вход заново.');
      if (pending.redirectUri !== redirectUri()) throw new Error('Адрес возврата изменился. Начните вход заново.');
      const db = window.db;
      const supabaseUrl = String(db?.supabaseUrl || '').replace(/\\/$/, '');
      const apiKey = window.RIM_SUPABASE_PUBLISHABLE_KEY;
      if (!supabaseUrl || !apiKey) throw new Error('Не найдена конфигурация Supabase.');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      let response;
      try {
        response = await fetch(supabaseUrl + '/functions/v1/' + EDGE_FUNCTION, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: apiKey },
          body: JSON.stringify({ code, code_verifier: pending.verifier, nonce: pending.nonce, redirect_uri: pending.redirectUri }),
          signal: controller.signal
        });
      } finally { clearTimeout(timer); }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.token_hash) throw new Error(payload.message || payload.error_description || 'Supabase не подтвердил аккаунт Telegram.');
      const { data, error } = await db.auth.verifyOtp({ token_hash: payload.token_hash, type: 'magiclink' });
      if (error) throw error;
      if (!data?.user || !data?.session) throw new Error('Supabase не выдал действующую сессию.');
      window.__RIM_LEGACY_CONTEXT?.setUser?.(data.user);
      window.currentUser = data.user;
      status('Вход через Telegram выполнен. Загружаем RIM…');
      await window.initializeApp?.();
      status('Вы вошли через Telegram. РИМ готов к работе.');
    } catch (error) {
      status(error?.name === 'AbortError' ? 'Telegram не ответил за 15 секунд. Попробуйте ещё раз.' : (error?.message || 'Не удалось завершить вход через Telegram.'));
    } finally { processing = false; }
  }

  window.signInWithTelegram = async function rimTelegramAuthFallback() {
    if (window.__RIM_AUTH_FORM_OWNED && typeof window.signInWithTelegram === 'function' &&
        window.signInWithTelegram !== rimTelegramAuthFallback) return window.signInWithTelegram();
    const button = document.getElementById('telegramAuthBtn');
    if (button) button.disabled = true;
    status('Подготавливаем защищённый вход через Telegram…');
    try { await start(); return true; }
    catch (error) { status(error?.message || 'Не удалось начать вход через Telegram.'); return false; }
    finally { if (button) button.disabled = false; }
  };

  // Module scripts are deferred; give the modular auth controller first chance.
  setTimeout(() => { if (!window.__RIM_AUTH_FORM_OWNED) void handleCallback(); }, 1500);
})();
