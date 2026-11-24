/* RIM auth + system-bot bridge. Kept outside the classic bootstrap to preserve its small compatibility surface. */
(() => {
  'use strict';
  const TELEGRAM_CLIENT_ID = '9041438103';
  const TELEGRAM_STORAGE_KEY = 'rim_telegram_oidc_v1';

  const status = message => {
    const node = document.getElementById('authStatus');
    if (node) node.textContent = String(message || '');
  };
  const base64url = bytes => btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
  const randomToken = (length = 48) => base64url(crypto.getRandomValues(new Uint8Array(length)));
  const redirectUri = () => window.RIM_TELEGRAM_REDIRECT_URI ||
    document.querySelector('meta[name="rim-telegram-redirect-uri"]')?.content ||
    (window.location.origin + window.location.pathname);

  async function signInWithTelegram() {
    const button = document.getElementById('telegramAuthBtn');
    if (button) button.disabled = true;
    try {
      if (!window.crypto?.subtle) throw new Error('Для защищённого входа Telegram требуется современный браузер.');
      const verifier = randomToken(48);
      const nonce = randomToken(32);
      const state = randomToken(32);
      const callbackUri = redirectUri();
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
      const challenge = base64url(new Uint8Array(digest));
      sessionStorage.setItem(TELEGRAM_STORAGE_KEY, JSON.stringify({ verifier, nonce, state, redirectUri: callbackUri }));
      const authUrl = new URL('https://oauth.telegram.org/auth');
      authUrl.search = new URLSearchParams({
        client_id: TELEGRAM_CLIENT_ID,
        redirect_uri: callbackUri,
        response_type: 'code',
        scope: 'openid profile',
        state,
        nonce,
        code_challenge: challenge,
        code_challenge_method: 'S256'
      }).toString();
      status('Переход к защищённой авторизации Telegram…');
      window.location.assign(authUrl.toString());
    } catch (error) {
      status(error?.message || 'Не удалось начать вход через Telegram.');
      if (button) button.disabled = false;
      console.error('RIM Telegram sign-in:', error);
    }
  }
  window.signInWithTelegram = signInWithTelegram;

  async function finishTelegramCallback() {
    const callback = window.__RIM_TELEGRAM_OIDC_CALLBACK;
    if (!callback) return;
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(TELEGRAM_STORAGE_KEY) || 'null'); } catch (_) {}
    try { sessionStorage.removeItem(TELEGRAM_STORAGE_KEY); } catch (_) {}
    if (callback.error) {
      status(callback.error_description || 'Вход через Telegram отменён или отклонён.');
      return;
    }
    if (!callback.code || !callback.state || !saved || saved.state !== callback.state) {
      status('Проверка состояния Telegram OAuth не пройдена. Начните вход заново.');
      return;
    }
    status('Подтверждаем аккаунт Telegram…');
    try {
      const db = window.db;
      if (!db) throw new Error('Клиент Supabase ещё не готов.');
      const { data, error } = await db.functions.invoke('telegram-auth', {
        body: {
          code: callback.code,
          code_verifier: saved.verifier,
          nonce: saved.nonce,
          redirect_uri: saved.redirectUri
        }
      });
      if (error) throw error;
      if (!data?.token_hash) throw new Error(data?.message || data?.error || 'Сервер не вернул токен входа.');
      const { data: verified, error: verifyError } = await db.auth.verifyOtp({
        token_hash: data.token_hash,
        type: 'magiclink'
      });
      if (verifyError) throw verifyError;
      if (!verified?.user) throw new Error('Supabase не создал пользовательскую сессию.');
      if (data.user_id && String(data.user_id) !== String(verified.user.id)) {
        throw new Error('Идентификатор пользователя не совпал после проверки токена.');
      }
      window.__RIM_SET_CURRENT_USER?.(verified.user);
      status('Вход выполнен. Загружаем RIM…');
      if (typeof window.initializeApp === 'function') await window.initializeApp();
    } catch (error) {
      console.error('RIM Telegram callback:', error);
      status(error?.message || 'Не удалось завершить вход через Telegram.');
    }
  }

  let installBusy = false;
  async function ensureZladenInstalled() {
    const user = window.__RIM_LEGACY_CONTEXT?.getUser?.() || window.currentUser;
    const db = window.db;
    if (!user?.id || !db || window.__RIM_ZLADEN_INSTALL_DONE || installBusy) return;
    installBusy = true;
    try {
      const { data, error } = await db.functions.invoke('rim-zladen', { body: { action: 'install' } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'zladen_install_failed');
      const result = data.result || {};
      if (result.installed === true) {
        window.__RIM_ZLADEN_INSTALL_DONE = true;
        if (typeof window.loadConversations === 'function') await window.loadConversations();
        if (typeof window.renderConversationList === 'function') window.renderConversationList();
        console.info('RIM Zladen installed:', result.conversation_id || 'ready');
      } else if (result.state === 'blocked' || result.state === 'unsubscribed') {
        window.__RIM_ZLADEN_INSTALL_DONE = true;
        console.info('RIM Zladen remains', result.state, 'by user preference.');
      }
    } catch (error) {
      console.warn('RIM Zladen auto-install deferred:', error?.message || error);
    } finally {
      installBusy = false;
    }
  }
  window.__RIM_ZLADEN_AFTER_INIT = () => { void ensureZladenInstalled(); };

  // Fallback for module-owned initialization paths; defer outside Supabase's auth callback lock.
  if (window.db?.auth) {
    window.db.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        setTimeout(() => { void ensureZladenInstalled(); }, 6000);
      }
    });
    window.db.auth.getSession().then(({ data, error }) => {
      if (!error && data?.session?.user) setTimeout(() => { void ensureZladenInstalled(); }, 6000);
    }).catch(error => console.warn('RIM Zladen session bootstrap:', error));
  }

  if (window.__RIM_TELEGRAM_OIDC_CALLBACK) void finishTelegramCallback();
})();
