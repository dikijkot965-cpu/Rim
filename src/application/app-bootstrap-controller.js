/**
 * Post-auth application bootstrap: hide auth screen, hydrate profile/settings/lists.
 * Classic bootstrap keeps a dual-bind shim until this controller owns initializeApp.
 */
export class AppBootstrapController {
  constructor({
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    getUser = () => null,
    loadProfile = async () => {},
    loadSettings = async () => {},
    loadConversations = async () => {},
    loadChannels = async () => {},
    notify = () => {},
    logger = null,
    mirrorState = () => {}
  } = {}) {
    this.document = documentRef;
    this.window = windowRef;
    this.getUser = getUser;
    this.loadProfile = loadProfile;
    this.loadSettings = loadSettings;
    this.loadConversations = loadConversations;
    this.loadChannels = loadChannels;
    this.notify = notify;
    this.logger = logger;
    this.mirrorState = mirrorState;
    this.initializing = false;
  }

  async initialize() {
    const user = this.getUser?.() || this.window?.currentUser;
    if (!user || this.initializing) return;
    this.initializing = true;
    try {
      this.document?.getElementById?.('authScreen')?.classList.add('hidden');
      this.document?.getElementById?.('app')?.classList.remove('hidden');
      const bounded = (task, label) => Promise.race([
        Promise.resolve().then(task),
        new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' превысил лимит ожидания 12 секунд')), 12000))
      ]);
      const results = await Promise.allSettled([
        bounded(this.loadProfile, 'Загрузка профиля'),
        bounded(this.loadSettings, 'Загрузка настроек'),
        bounded(this.loadConversations, 'Загрузка переписок'),
        bounded(this.loadChannels, 'Загрузка каналов')
      ]);
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          this.logger?.warn?.('app.bootstrap.section.failed', { index: i, message: r.reason?.message || String(r.reason) });
        }
      });
      const status = this.document?.getElementById?.('chatHeadStatus');
      if (status) status.textContent = 'На связи';
    } catch (error) {
      this.logger?.error?.('app.bootstrap.failed', error);
      this.notify?.(`Ошибка запуска приложения: ${error?.message || error}`);
    } finally {
      this.initializing = false;
      try { this.mirrorState?.(); } catch { /* ignore */ }
      try { this.window.__rimMirrorLegacyState?.(); } catch { /* ignore */ }
    }
  }

  bindGlobals() {
    const win = this.window;
    win.__RIM_APP_BOOTSTRAP_OWNED = true;
    win.initializeApp = () => this.initialize();
  }

  dispose() {
    try { this.window.__RIM_APP_BOOTSTRAP_OWNED = false; } catch { /* ignore */ }
  }
}
