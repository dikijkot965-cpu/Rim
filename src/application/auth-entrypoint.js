import { AuthFormController } from './auth-form-controller.js';

/**
 * Connect the tested modular auth controller to the classic HTML entrypoints.
 * The classic bootstrap has already created window.db and initializeApp before
 * this module script executes (index.html loads it after rim-app.bundle.js).
 */
export function installAuthEntrypoint({
  windowRef = globalThis.window,
  documentRef = globalThis.document,
  client = windowRef?.db,
  logger = console
} = {}) {
  if (!windowRef || !documentRef) throw new Error('RIM auth: browser window/document are unavailable.');
  if (!client?.auth) throw new Error('RIM auth: Supabase client is unavailable.');

  const controller = new AuthFormController({
    client,
    documentRef,
    windowRef,
    logger,
    onSignedIn: async user => {
      if (typeof windowRef.__RIM_SET_CURRENT_USER === 'function') {
        windowRef.__RIM_SET_CURRENT_USER(user);
      } else {
        windowRef.currentUser = user;
      }

      if (typeof windowRef.initializeApp !== 'function') {
        throw new Error('Основной модуль RIM ещё не подготовил запуск приложения. Обновите страницу и повторите вход.');
      }
      await windowRef.initializeApp();
    }
  });

  // bindGlobals replaces the legacy no-op Telegram shim and routes the
  // existing inline HTML handlers (signIn/signUp/recovery) to this controller.
  controller.bindGlobals();
  windowRef.__RIM_AUTH_FORM_CONTROLLER = controller;
  windowRef.__RIM_AUTH_FORM_READY = true;
  return controller;
}

function bootAuthEntrypoint() {
  try {
    installAuthEntrypoint();
    console.info('[RIM auth] Modular auth controller connected.');
  } catch (error) {
    const status = globalThis.document?.getElementById?.('authStatus');
    if (status) status.textContent = error?.message || 'Не удалось загрузить модуль авторизации RIM.';
    globalThis.window && (globalThis.window.__RIM_AUTH_FORM_READY = false);
    console.error('[RIM auth] Controller initialization failed:', error);
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  bootAuthEntrypoint();
}
