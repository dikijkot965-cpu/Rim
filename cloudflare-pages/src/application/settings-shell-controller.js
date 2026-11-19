/**
 * Settings modal shell: theme, language, privacy block, blocks entry.
 * Delegates persistence to existing changeTheme/changeLanguage/privacy services when present.
 */
export class SettingsShellController {
  constructor({
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    getTheme = () => 'imperial',
    getLanguage = () => 'ru',
    getPrivacy = () => ({ showOnline: true, allowForward: true, showRead: true }),
    showModal = null,
    logger = null
  } = {}) {
    this.document = documentRef;
    this.window = windowRef;
    this.getTheme = getTheme;
    this.getLanguage = getLanguage;
    this.getPrivacy = getPrivacy;
    this.showModal = showModal || ((html) => this.window?.showModal?.(html));
    this.logger = logger;
  }

  #esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  }

  #selected(current, value) {
    return String(current) === String(value) ? 'selected' : '';
  }

  open() {
    const theme = this.getTheme?.() || 'imperial';
    const language = this.getLanguage?.() || 'ru';
    const privacy = this.getPrivacy?.() || {};
    const showOnline = privacy.showOnline !== false;
    const allowForward = privacy.allowForward !== false;
    const showRead = privacy.showRead !== false;

    const themeOptions = [
      ['imperial', 'Имперская'],
      ['dark', 'Тёмная'],
      ['light', 'Светлая'],
      ['halloween', 'Хэллоуинская 🎃'],
      ['halloween-imperial', '⚜ Хэллоуинская имперская']
    ].map(([value, label]) => (
      `<option value="${value}" ${this.#selected(theme, value)}>${label}</option>`
    )).join('');

    const languageOptions = [
      ['ru', 'Русский'],
      ['be', 'Беларуская'],
      ['pl', 'Polski'],
      ['fi', 'Suomi'],
      ['en', 'English']
    ].map(([value, label]) => (
      `<option value="${value}" ${this.#selected(language, value)}>${label}</option>`
    )).join('') + '<option value="zh" disabled>中文 — в разработке</option>';

    const html = `
      <h2 class="modal-title">Настройки</h2>
      <div class="settings-row">
        <span>Оформление</span>
        <select id="themeSelect">${themeOptions}</select>
      </div>
      <div class="settings-row">
        <span>Язык</span>
        <select id="languageSelect">${languageOptions}</select>
      </div>
      <div class="settings-row">
        <span>Уведомления</span>
        <button class="action-btn" type="button" data-rim-settings-action="notifications">Настроить</button>
      </div>

      <h3 style="color:var(--gold2);font-family:'Playfair Display',serif;margin:18px 0 4px">Конфиденциальность</h3>
      <div class="rim-settings-line">
        <div><b>Показывать время в сети</b><small>Позволяет другим видеть, когда вы были активны.</small></div>
        <input class="rim-switch" type="checkbox" id="rimOnline" ${showOnline ? 'checked' : ''}>
      </div>
      <div class="rim-settings-line">
        <div><b>Разрешить пересылку сообщений</b><small>Запрещённую к пересылке переписку нельзя будет переслать через приложение.</small></div>
        <input class="rim-switch" type="checkbox" id="rimForward" ${allowForward ? 'checked' : ''}>
      </div>
      <div class="rim-settings-line">
        <div><b>Показывать прочтение сообщений</b><small>Расширенная настройка статуса прочтения. В будущем может войти в платную подписку; сейчас доступна в тестовом режиме.</small></div>
        <input class="rim-switch" type="checkbox" id="rimRead" ${showRead ? 'checked' : ''}>
      </div>
      <button class="primary-btn" style="width:100%;margin-top:12px" type="button" data-rim-settings-action="save-privacy">Сохранить конфиденциальность</button>

      <h3 style="color:var(--gold2);font-family:'Playfair Display',serif;margin:18px 0 4px">Безопасность аккаунта</h3>
      <div class="feature-small">Коды восстановления позволяют вернуть доступ, даже если внешний провайдер входа недоступен. Каждый код одноразовый.</div>
      <button class="action-btn" style="width:100%;margin-top:8px" type="button" data-rim-settings-action="recovery-codes">Создать / заменить коды восстановления</button>

      <button class="action-btn" id="rimOpenBlocksBtn" style="width:100%;margin-top:10px" type="button" data-rim-settings-action="blocks">Заблокированные пользователи</button>

      <button class="primary-btn" style="width:100%;margin-top:12px" type="button" data-rim-settings-action="done">Готово</button>
    `;

    this.showModal(html);
    queueMicrotask(() => this.#bind());
  }

  #bind() {
    const modal = this.document.querySelector?.('#modalRoot .modal');
    if (!modal) return;

    const themeSelect = this.document.getElementById('themeSelect');
    themeSelect?.addEventListener?.('change', () => {
      const value = themeSelect.value;
      if (typeof this.window?.changeTheme === 'function') this.window.changeTheme(value);
      else {
        try { this.window.currentTheme = value; } catch { /* ignore */ }
        this.window?.applyTheme?.();
      }
    });

    const languageSelect = this.document.getElementById('languageSelect');
    languageSelect?.addEventListener?.('change', () => {
      const value = languageSelect.value;
      if (typeof this.window?.changeLanguage === 'function') this.window.changeLanguage(value);
      else {
        try { this.window.currentLanguage = value; } catch { /* ignore */ }
      }
    });

    modal.querySelectorAll?.('[data-rim-settings-action]')?.forEach?.(node => {
      node.addEventListener('click', event => {
        const action = node.getAttribute('data-rim-settings-action');
        if (action === 'done') this.window?.closeModal?.();
        else if (action === 'save-privacy') this.window?.rimSavePrivacy?.();
        else if (action === 'blocks') this.window?.rimOpenBlocks?.();
        else if (action === 'notifications') this.window?.openNotificationSettings?.();
        else if (action === 'recovery-codes') this.window?.rimGenerateRecoveryCodes?.();
        event.preventDefault?.();
      });
    });
  }
}
