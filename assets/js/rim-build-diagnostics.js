/* RIM AUTHFIX3 build/runtime diagnostics. This is deliberately independent of the app bundle. */
(() => {
  'use strict';
  const id = '4.1.8.178-AUTHFIX3';
  window.__RIM_BUILD_ID = id;
  window.__RIM_BUILD_DIAGNOSTICS = { html: 'loaded', runtime: 'waiting', modules: 'waiting', auth: 'waiting' };
  window.__RIM_SET_BUILD_STATUS = (key, value) => {
    try {
      window.__RIM_BUILD_DIAGNOSTICS[key] = String(value);
      const node = document.getElementById('rimBuildStampStatus');
      if (node) node.textContent = Object.entries(window.__RIM_BUILD_DIAGNOSTICS).map(([k, v]) => k.toUpperCase() + ': ' + v).join(' · ');
    } catch {}
  };
  window.__RIM_SET_BUILD_STATUS('html', 'BUILD ' + id + ' загружен');
  window.addEventListener('error', event => window.__RIM_SET_BUILD_STATUS('error', String(event?.message || event?.filename || 'ошибка загрузки').slice(0, 180)));
  window.addEventListener('unhandledrejection', event => window.__RIM_SET_BUILD_STATUS('error', String(event?.reason?.message || event?.reason || 'unhandled rejection').slice(0, 180)));
  window.rimReloadCurrentBuild = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('rim_build', '178-authfix3-' + Date.now().toString(36));
    window.location.replace(url.toString());
  };
  window.addEventListener('rim:ready', event => window.__RIM_SET_BUILD_STATUS('modules', 'подключены · ' + (event?.detail?.build || id)));
  document.addEventListener('DOMContentLoaded', () => {
    window.__RIM_SET_BUILD_STATUS('html', 'BUILD ' + id + ' загружен');
    window.setTimeout(() => {
      if (window.__RIM_BUILD_DIAGNOSTICS.modules === 'waiting') window.__RIM_SET_BUILD_STATUS('modules', 'НЕ ПОДКЛЮЧЕНЫ за 20 секунд');
      if (window.__RIM_BUILD_DIAGNOSTICS.auth === 'waiting') window.__RIM_SET_BUILD_STATUS('auth', window.__RIM_AUTH_FORM_OWNED ? 'подключён' : 'НЕ ПОДКЛЮЧЁН');
    }, 20000);
  });
})();
