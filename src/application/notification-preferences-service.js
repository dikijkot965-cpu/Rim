import { Err, Ok } from '../core/result.js';

const FIELDS = Object.freeze([
  ['messages_enabled', 'Личные сообщения'],
  ['channel_posts_enabled', 'Публикации каналов'],
  ['comments_enabled', 'Комментарии'],
  ['reactions_enabled', 'Реакции'],
  ['announcements_enabled', 'Объявления']
]);

/**
 * Notification preference load/save over notification_preferences.
 */
export class NotificationPreferencesService {
  constructor({
    client,
    getUser,
    notify = () => {},
    showModal = null,
    closeModal = null,
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    logger = null
  } = {}) {
    this.client = client;
    this.getUser = getUser;
    this.notify = notify;
    this.showModal = showModal || ((html) => this.window?.showModal?.(html));
    this.closeModal = closeModal || (() => this.window?.closeModal?.());
    this.document = documentRef;
    this.window = windowRef;
    this.logger = logger;
  }

  async open() {
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Требуется вход в РИМ.'));
    const { data, error } = await this.client
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) return Err(error);
    const prefs = data || {};
    const rows = FIELDS.map(([key, label]) => {
      const checked = prefs[key] !== false ? 'checked' : '';
      return `<div class="settings-row"><span>${label}</span>
        <input type="checkbox" id="np_${key}" ${checked}></div>`;
    }).join('');
    this.showModal(`<h2 class="modal-title">Настройки уведомлений</h2>${rows}
      <div class="feature-small">Push на телефон требует отдельной серверной отправки.</div>
      <div class="modal-actions">
        <button class="action-btn" type="button" onclick="closeModal()">Отмена</button>
        <button class="primary-btn" type="button" onclick="saveNotificationSettings()">Сохранить</button>
      </div>
      <button class="action-btn" style="width:100%;margin-top:8px" type="button" onclick="subscribePushLocally?.()">Разрешить уведомления браузера</button>`);
    return Ok(prefs);
  }

  async saveFromDom() {
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Требуется вход в РИМ.'));
    const payload = {
      user_id: user.id,
      updated_at: new Date().toISOString()
    };
    for (const [key] of FIELDS) {
      payload[key] = !!this.document.getElementById(`np_${key}`)?.checked;
    }
    const { error } = await this.client.from('notification_preferences').upsert(payload);
    if (error) return Err(error);
    this.notify('Настройки уведомлений сохранены.');
    this.closeModal?.();
    return Ok(payload);
  }
}
