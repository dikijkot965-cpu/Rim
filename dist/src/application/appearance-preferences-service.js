import { Err, Ok } from '../core/result.js';

const THEME_KEY = 'rim_theme';
const LANGUAGE_KEY = 'rim_language';
const ALLOWED_LANGUAGES = ['ru','be','pl','fi','en'];
const ALLOWED_THEMES = Object.freeze([
  'imperial',
  'dark',
  'light',
  'halloween',
  'halloween-imperial'
]);
const THEME_COLORS = Object.freeze({
  imperial: '#17130e',
  dark: '#101216',
  light: '#f1f2f5',
  halloween: '#160e20',
  'halloween-imperial': '#100d19'
});
// DB CHECK historically allows halloween but not halloween-imperial.
const DB_THEME_ALIAS = Object.freeze({
  'halloween-imperial': 'halloween'
});

/**
 * Theme + language preference boundary.
 * Applies DOM theme tokens and optionally upserts user_settings.
 */
export class AppearancePreferencesService {
  constructor({
    client,
    getUser,
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    storage = globalThis.localStorage,
    notify = () => {},
    applyLanguageLabels = null,
    logger = null
  } = {}) {
    this.client = client;
    this.getUser = getUser;
    this.document = documentRef;
    this.window = windowRef;
    this.storage = storage;
    this.notify = notify;
    this.applyLanguageLabels = applyLanguageLabels;
    this.logger = logger;
  }

  getTheme() {
    try {
      return this.window?.currentTheme
        || this.storage?.getItem?.(THEME_KEY)
        || 'imperial';
    } catch {
      return 'imperial';
    }
  }

  getLanguage() {
    try {
      return this.window?.currentLanguage
        || this.storage?.getItem?.(LANGUAGE_KEY)
        || 'ru';
    } catch {
      return 'ru';
    }
  }

  applyTheme(theme = this.getTheme()) {
    let value = String(theme || 'imperial');
    if (!ALLOWED_THEMES.includes(value)) value = 'imperial';
    try { this.window.currentTheme = value; } catch { /* ignore */ }
    try { this.storage?.setItem?.(THEME_KEY, value); } catch { /* ignore */ }
    try {
      if (this.document?.body) this.document.body.dataset.theme = value;
    } catch { /* ignore */ }
    try {
      const meta = this.document?.querySelector?.('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', THEME_COLORS[value] || THEME_COLORS.imperial);
    } catch { /* ignore */ }
    return value;
  }

  applyLanguage(language = this.getLanguage()) {
    const value = String(language || 'ru');
    try { this.window.currentLanguage = value; } catch { /* ignore */ }
    try { this.storage?.setItem?.(LANGUAGE_KEY, value); } catch { /* ignore */ }
    try { this.applyLanguageLabels?.(value); } catch { /* ignore */ }
    // Fallback tab labels if no i18n helper is wired.
    try {
      const map = {
        ru: { chats: 'Чаты', channels: 'Каналы', music: 'Музыка', search: 'Поиск', message: 'Сообщение' },
        be: { chats: 'Чаты', channels: 'Каналы', music: 'Музыка', search: 'Пошук', message: 'Паведамленне' },
        en: { chats: 'Chats', channels: 'Channels', music: 'Music', search: 'Search', message: 'Message' },
        pl: { chats: 'Czaty', channels: 'Kanały', music: 'Muzyka', search: 'Szukaj', message: 'Wiadomość' },
        fi: { chats: 'Keskustelut', channels: 'Kanavat', music: 'Musiikki', search: 'Haku', message: 'Viesti' }
      };
      const labels = map[value] || map.ru;
      const set = (id, text) => {
        const node = this.document?.getElementById?.(id);
        if (node) node.textContent = text;
      };
      set('tabChats', labels.chats);
      set('tabChannels', labels.channels);
      set('tabMusic', labels.music);
      const search = this.document?.getElementById?.('chatSearch');
      if (search) search.placeholder = labels.search;
      const input = this.document?.getElementById?.('messageInput');
      if (input) input.placeholder = labels.message;
    } catch { /* ignore */ }
    return value;
  }

  async saveSettings() {
    const user = this.getUser?.();
    const theme = this.getTheme();
    const language = this.getLanguage();
    if (!user?.id) return Ok({ synced: false, theme, language });

    const dbTheme = DB_THEME_ALIAS[theme] || theme;
    try {
      const { error } = await this.client.from('user_settings').upsert({
        user_id: user.id,
        theme: dbTheme,
        language,
        updated_at: new Date().toISOString()
      });
      if (error) {
        this.notify(`Не удалось сохранить настройки: ${error.message}`);
        return Err(error);
      }
      return Ok({ synced: true, theme, language, dbTheme });
    } catch (error) {
      this.logger?.warn?.('appearance.save.failed', { message: error?.message });
      return Err(error);
    }
  }

  async changeTheme(value) {
    if (!ALLOWED_THEMES.includes(String(value))) {
      return Err(new Error('Неизвестная тема.'));
    }
    this.applyTheme(value);
    return this.saveSettings();
  }

  async changeLanguage(value) {
    let language = String(value || '').trim();
    if (!language) return Err(new Error('Не указан язык.'));
    if (language === 'uk' || language === 'kk') language = 'ru';
    if (!ALLOWED_LANGUAGES.includes(language)) language = 'ru';
    this.applyLanguage(language);
    return this.saveSettings();
  }

  bootstrap() {
    this.applyTheme(this.getTheme());
    this.applyLanguage(this.getLanguage());
  }

  /**
   * Hydrate theme/language from user_settings (server), then apply.
   * Falls back to local storage values when offline or row missing.
   */
  async loadFromServer() {
    const user = this.getUser?.();
    if (!user?.id || !this.client) {
      this.bootstrap();
      return Ok({ source: 'local', theme: this.getTheme(), language: this.getLanguage() });
    }
    try {
      const { data, error } = await this.client
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) {
        this.logger?.warn?.('appearance.load.failed', { message: error.message });
        this.bootstrap();
        return Err(error);
      }
      if (data) {
        let theme = data.theme || 'imperial';
        if (theme === 'halloween' && this.storage?.getItem?.(THEME_KEY) === 'halloween-imperial') {
          theme = 'halloween-imperial';
        }
        if (!ALLOWED_THEMES.includes(theme)) theme = 'imperial';
        let language = data.language || 'ru';
        if (language === 'uk' || language === 'kk') language = 'ru';
        if (!ALLOWED_LANGUAGES.includes(language)) language = 'ru';
        this.applyTheme(theme);
        this.applyLanguage(language);
        return Ok({ source: 'server', theme, language });
      }
      this.bootstrap();
      return Ok({ source: 'local', theme: this.getTheme(), language: this.getLanguage() });
    } catch (error) {
      this.logger?.warn?.('appearance.load.failed', { message: error?.message });
      this.bootstrap();
      return Err(error);
    }
  }
}

