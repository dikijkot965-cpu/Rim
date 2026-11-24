import { Err, Ok } from '../core/result.js';

/** First-party Zladen system-bot lifecycle adapter. Commands execute in the server-side SQL trigger pipeline. */
export class ZladenBotService {
  constructor({ client, getUser, logger = null } = {}) {
    this.client = client;
    this.getUser = getUser;
    this.logger = logger;
    this.inFlight = null;
  }

  async invoke(action, payload = {}) {
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Для работы со Злыдей войдите в РИМ.'));
    const response = await Promise.race([
      this.client.functions.invoke('rim-zladen', { body: { action, ...payload } }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Злыдя не ответил за 15 секунд. Проверьте подключение к Supabase.')), 15000))
    ]);
    if (response.error) return Err(response.error);
    if (response.data?.error) return Err(new Error(String(response.data.error)));
    return Ok(response.data?.result ?? response.data);
  }

  async install() {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.invoke('install').finally(() => { this.inFlight = null; });
    const result = await this.inFlight;
    if (!result.ok) this.logger?.warn?.('zladen.install.failed', { message: result.error?.message });
    return result;
  }

  async setState(state) {
    if (!['active', 'blocked', 'unsubscribed'].includes(state)) return Err(new Error('Неизвестное состояние системного бота.'));
    return this.invoke('state', { state });
  }

  async getOwnerProfile() {
    return this.invoke('profile');
  }

  async getPublicProfile() {
    return this.invoke('public_profile');
  }

  async updateOwnerProfile({ display_name, username, avatar_path, avatarFile } = {}) {
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Требуется вход в РИМ.'));
    let uploadedPath = avatar_path;
    if (avatarFile) {
      if (avatarFile.size > 3 * 1024 * 1024) return Err(new Error('Аватар Злыди не должен превышать 3 МБ.'));
      if (!['image/jpeg','image/png','image/webp'].includes(avatarFile.type)) return Err(new Error('Поддерживаются JPG, PNG и WebP.'));
      const ext = ({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp' })[avatarFile.type];
      uploadedPath = `${user.id}/system-bots/zladen/${globalThis.crypto.randomUUID()}.${ext}`;
      const upload = await this.client.storage.from('avatars').upload(uploadedPath, avatarFile, { contentType: avatarFile.type, upsert: false });
      if (upload.error) return Err(upload.error);
    }
    const result = await this.invoke('owner_update', { display_name, username, avatar_path: uploadedPath });
    if (!result.ok && avatarFile && uploadedPath) {
      try { await this.client.storage.from('avatars').remove([uploadedPath]); } catch { /* best-effort cleanup */ }
    }
    return result;
  }
}
