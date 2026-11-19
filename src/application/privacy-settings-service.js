import { Err, Ok } from '../core/result.js';

const STORAGE_KEY = 'rim_privacy_preferences_v1';

/**
 * Privacy preferences: local projection + optional cloud sync.
 */
export class PrivacySettingsService {
  constructor({
    client,
    getUser,
    getTheme = () => 'dark',
    getLanguage = () => 'ru',
    storage = globalThis.localStorage,
    notify = () => {},
    logger = null
  } = {}) {
    this.client = client;
    this.getUser = getUser;
    this.getTheme = getTheme;
    this.getLanguage = getLanguage;
    this.storage = storage;
    this.notify = notify;
    this.logger = logger;
  }

  readLocal() {
    try {
      const raw = this.storage?.getItem?.(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        showOnline: parsed.showOnline !== false,
        allowForward: parsed.allowForward !== false,
        showRead: parsed.showRead !== false
      };
    } catch {
      return { showOnline: true, allowForward: true, showRead: true };
    }
  }

  writeLocal(prefs) {
    const value = {
      showOnline: prefs.showOnline !== false,
      allowForward: prefs.allowForward !== false,
      showRead: prefs.showRead !== false
    };
    try {
      this.storage?.setItem?.(STORAGE_KEY, JSON.stringify(value));
    } catch (error) {
      this.logger?.warn?.('privacy.local.write.failed', { message: error?.message });
    }
    return value;
  }

  async saveFromDom({
    showOnline,
    allowForward,
    showRead
  } = {}) {
    const user = this.getUser?.();
    const local = this.writeLocal({ showOnline, allowForward, showRead });

    if (!user?.id) {
      this.notify('Сохранено на этом устройстве.');
      return Ok({ local, synced: false });
    }

    const payload = {
      user_id: user.id,
      show_online: local.showOnline,
      allow_message_forward: local.allowForward,
      show_read_receipts: local.showRead,
      theme: this.getTheme?.() || 'dark',
      language: this.getLanguage?.() || 'ru',
      updated_at: new Date().toISOString()
    };

    try {
      const { error } = await this.client.from('user_settings').upsert(payload);
      if (error) {
        this.notify('Локально сохранено. Синхронизация ожидает миграцию БД.');
        return Ok({ local, synced: false, warning: error.message });
      }

      const { error: profileError } = await this.client
        .from('profiles')
        .update({ show_online: local.showOnline })
        .eq('id', user.id);
      if (profileError) {
        this.notify('Настройки сохранены, но статус приватности не удалось синхронизировать. Повторите сохранение.');
        return Ok({ local, synced: true, profileSynced: false, warning: profileError.message });
      }

      this.notify('Настройки конфиденциальности сохранены.');
      return Ok({ local, synced: true, profileSynced: true });
    } catch (error) {
      this.logger?.warn?.('privacy.save.failed', { message: error?.message });
      this.notify('Локально сохранено. Облачная синхронизация не удалась.');
      return Err(error);
    }
  }
}
