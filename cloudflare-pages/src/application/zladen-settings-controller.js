import { escapeHtml } from '../core/html.js';

export class ZladenSettingsController {
  constructor({ service, isOwner = () => false, notify = () => {}, documentRef = globalThis.document, windowRef = globalThis.window } = {}) {
    this.service = service;
    this.isOwner = isOwner;
    this.notify = notify;
    this.document = documentRef;
    this.window = windowRef;
    this.root = null;
  }

  async open() {
    if (!this.isOwner?.()) { this.notify('Настройки Злыди доступны только владельцу РИМа.'); return false; }
    const section = this.document?.getElementById?.('toolsSection');
    const host = section?.querySelector?.('.rim-section-body') || section;
    if (!host) return false;
    this.root = this.document.createElement('section');
    this.root.className = 'rim-zladen-settings';
    this.root.innerHTML = `
      <style>.rim-zladen-settings{padding:14px;color:var(--text-primary,#eee)}.rim-zladen-settings-head{display:flex;gap:14px;align-items:center;margin-bottom:18px}.rim-zladen-settings-head button,.rim-zladen-settings-form button{border:1px solid var(--border-color,#555);border-radius:12px;padding:10px 14px;background:var(--surface-2,#222);color:inherit}.rim-zladen-settings-head small{display:block;opacity:.7}.rim-zladen-settings-form{display:grid;gap:14px;max-width:480px}.rim-zladen-settings-form label{display:grid;gap:6px}.rim-zladen-settings-form input{width:100%;box-sizing:border-box;padding:12px;border:1px solid var(--border-color,#555);border-radius:10px;background:var(--surface-1,#171717);color:inherit}.rim-zladen-settings-note{opacity:.7;font-size:13px}</style>
      <header class="rim-zladen-settings-head"><button type="button" data-zladen-back>← Инструменты</button><div><b>Злыдя</b><small>Профиль системного помощника</small></div></header>
      <form class="rim-zladen-settings-form">
        <label>Имя<input name="display_name" maxlength="40" required></label>
        <label>Ссылка / username<input name="username" maxlength="35" required placeholder="zladen_bot"></label>
        <label>Аватар<input name="avatar" type="file" accept="image/png,image/jpeg,image/webp"></label>
        <button type="submit" data-zladen-save>Сохранить профиль</button>
        <p class="rim-zladen-settings-note">Ссылка будет иметь вид @username. Новое имя и ссылка обновятся в профиле бота.</p>
      </form>`;
    host.replaceChildren(this.root);
    this.root.querySelector('[data-zladen-back]')?.addEventListener('click', () => this.window?.openToolsPage?.());
    this.root.querySelector('form')?.addEventListener('submit', event => { event.preventDefault(); void this.save(); });
    const result = await this.service.getOwnerProfile();
    if (!result.ok) { this.notify(result.error?.message || 'Не удалось загрузить профиль Злыди.'); return false; }
    const form = this.root.querySelector('form');
    form.elements.display_name.value = result.value.display_name || 'Злыдя';
    form.elements.username.value = result.value.username || 'zladen_bot';
    return true;
  }

  async save() {
    const form = this.root?.querySelector?.('form');
    if (!form) return false;
    const button = form.querySelector('[data-zladen-save]');
    const file = form.elements.avatar.files?.[0] || null;
    button.disabled = true;
    try {
      const result = await this.service.updateOwnerProfile({
        display_name: form.elements.display_name.value.trim(),
        username: form.elements.username.value.trim(),
        avatarFile: file || undefined
      });
      if (!result.ok) throw result.error;
      this.notify('Профиль Злыди обновлён.');
      return true;
    } catch (error) {
      this.notify(error?.message || 'Не удалось сохранить профиль Злыди.');
      return false;
    } finally { button.disabled = false; }
  }
}
