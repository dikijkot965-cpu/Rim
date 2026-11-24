/* RIM Telegram OIDC fallback. Keeps the sign-in action alive if the modular bundle fails to load. */
(() => {
  'use strict';
  let servicePromise = null;
  const status = message => {
    const node = document.getElementById('authStatus');
    if (node) node.textContent = String(message || '');
  };
  async function service() {
    if (!window.db?.auth) throw new Error('Клиент Supabase ещё не готов. Обновите страницу.');
    if (!servicePromise) {
      servicePromise = import('../../src/application/telegram-auth-service.js')
        .then(({ TelegramAuthService }) => new TelegramAuthService({ client: window.db, windowRef: window }))
        .catch(error => { servicePromise = null; throw error; });
    }
    return servicePromise;
  }
  window.signInWithTelegram = async function rimTelegramAuthFallback() {
    if (window.__RIM_AUTH_FORM_OWNED && typeof window.signInWithTelegram === 'function' &&
        window.signInWithTelegram !== rimTelegramAuthFallback) return window.signInWithTelegram();
    const button = document.getElementById('telegramAuthBtn');
    if (button) button.disabled = true;
    status('Подготавливаем защищённый вход через Telegram…');
    try {
      await (await service()).start();
      return true;
    } catch (error) {
      status(error?.message || 'Не удалось начать вход через Telegram.');
      return false;
    } finally {
      if (button) button.disabled = false;
    }
  };
  async function handleCallback() {
    if (window.__RIM_AUTH_FORM_OWNED) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('code') && !url.searchParams.has('state') && !url.searchParams.has('error')) return;
    status('Подтверждаем вход через Telegram…');
    try {
      const result = await (await service()).handleCallback();
      if (!result.handled) return;
      if (!result.ok) throw result.error || new Error('Вход через Telegram не выполнен.');
      window.__RIM_LEGACY_CONTEXT?.setUser?.(result.user);
      window.currentUser = result.user;
      status('Вход через Telegram выполнен. Загружаем RIM…');
      await window.initializeApp?.();
      status('Вы вошли через Telegram. РИМ готов к работе.');
    } catch (error) {
      status(error?.message || 'Не удалось завершить вход через Telegram.');
    }
  }
  // Module scripts are deferred; give the modular auth controller first chance.
  setTimeout(() => { if (!window.__RIM_AUTH_FORM_OWNED) void handleCallback(); }, 1500);
})();
