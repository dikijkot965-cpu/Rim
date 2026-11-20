import { Err, Ok } from '../core/result.js';

const FIELDS = Object.freeze([
  ['messages_enabled', 'Личные сообщения'],
  ['channel_posts_enabled', 'Публикации каналов'],
  ['comments_enabled', 'Комментарии'],
  ['reactions_enabled', 'Реакции'],
  ['announcements_enabled', 'Объявления'],
  ['push_enabled', 'Push-уведомления'],
  ['show_message_preview', 'Показывать имя, чат и текст сообщения в уведомлениях']
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
      const checked = key === 'push_enabled' ? (prefs[key] === true ? 'checked' : '') : (prefs[key] !== false ? 'checked' : '');
      return `<div class="settings-row"><span>${label}</span>
        <input type="checkbox" id="np_${key}" ${checked}></div>`;
    }).join('');
    this.showModal(`<h2 class="modal-title">Настройки уведомлений</h2>${rows}
      <div class="feature-small">При включённом показе уведомления содержат имя отправителя, название чата или канала и короткий фрагмент сообщения — как в привычных мессенджерах. Отображение на экране блокировки также зависит от настроек Android.</div>
      <div class="modal-actions">
        <button class="action-btn" type="button" onclick="closeModal()">Отмена</button>
        <button class="primary-btn" type="button" onclick="saveNotificationSettings()">Сохранить</button>
      </div>
      <button class="primary-btn" style="width:100%;margin-top:8px" type="button" onclick="subscribePushLocally?.()">Подключить push на этом устройстве</button>
      <button class="action-btn" style="width:100%;margin-top:6px" type="button" onclick="unsubscribePushLocally?.()">Отключить push на этом устройстве</button>`);
    return Ok(prefs);
  }

  async subscribePush() {
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Требуется войти в РИМ.'));
    const nav = this.window?.navigator;
    if (!nav?.serviceWorker || !this.window?.PushManager || !this.window?.Notification) {
      return Err(new Error('Этот браузер не поддерживает push-уведомления.'));
    }
    if (!this.window.isSecureContext) return Err(new Error('Push работает только через HTTPS.'));
    const permission = await this.window.Notification.requestPermission();
    if (permission !== 'granted') return Err(new Error('Разрешение на уведомления не выдано.'));
    const { data: keyData, error: keyError } = await this.client.functions.invoke('rim-push', { body: { action: 'public_key' } });
    if (keyError || !keyData?.public_key) return Err(new Error('Сервер push ещё не настроен: требуется VAPID public key.'));
    const registration = await nav.serviceWorker.register('/service-worker.js', { scope: '/' });
    await nav.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const key = String(keyData.public_key).replace(/-/g, '+').replace(/_/g, '/');
      const padded = key.padEnd(Math.ceil(key.length / 4) * 4, '=');
      const binary = this.window.atob(padded);
      const applicationServerKey = Uint8Array.from(binary, char => char.charCodeAt(0));
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    }
    const value = subscription.toJSON();
    const endpoint = String(value.endpoint || '');
    if (!/^https:\/\//i.test(endpoint) || !value.keys?.p256dh || !value.keys?.auth) return Err(new Error('Браузер вернул некорректную push-подписку.'));
    const { data: saved, error: saveError } = await this.client.functions.invoke('rim-push', { body: { action: 'subscribe', subscription: value, device_label: String(this.window?.navigator?.userAgent || '').slice(0, 180) } });
    if (saveError || saved?.error) return Err(saveError || new Error('Не удалось сохранить push-подписку.'));
    const pushToggle = this.document?.getElementById?.('np_push_enabled');
    if (pushToggle) pushToggle.checked = true;
    this.notify('Push-уведомления подключены на этом устройстве.');
    return Ok({ endpoint, enabled: true });
  }

  async unsubscribePush() {
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Требуется войти в РИМ.'));
    const registration = await this.window?.navigator?.serviceWorker?.getRegistration?.('/');
    const subscription = await registration?.pushManager?.getSubscription?.();
    if (subscription) {
      const { error } = await this.client.functions.invoke('rim-push', { body: { action: 'unsubscribe', endpoint: subscription.endpoint } });
      if (error) return Err(error);
      await subscription.unsubscribe();
    } else {
      const { error } = await this.client.from('notification_preferences').upsert({ user_id: user.id, push_enabled: false, updated_at: new Date().toISOString() });
      if (error) return Err(error);
    }
    const pushToggle = this.document?.getElementById?.('np_push_enabled');
    if (pushToggle) pushToggle.checked = false;
    this.notify('Push-уведомления отключены на этом устройстве.');
    return Ok(true);
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
