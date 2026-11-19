/**
 * Imperial cabinet secondary features: bulletin board, notifications, achievements, member card.
 * Ported from retired legacy 03 — uses same tables and moderation flow.
 */
import { escapeHtml as esc } from '../core/html.js';

function formatDate(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString('ru-RU'); } catch { return '—'; }
}

export class ImperialFeaturesController {
  constructor({
    client,
    getUser,
    isImperator = () => false,
    showModal = null,
    notify = null,
    windowRef = globalThis.window
  } = {}) {
    this.client = client;
    this.getUser = getUser;
    this.isImperator = isImperator;
    this.window = windowRef;
    this.showModal = showModal || ((html) => this.window?.showModal?.(html));
    this.notify = notify || ((msg) => this.window?.toast?.(msg));
  }

  #user() {
    return this.getUser?.() || this.window?.currentUser || null;
  }

  async openBulletinBoard() {
    const user = this.#user();
    if (!user?.id) return this.notify?.('Нужен вход в аккаунт.');
    const { data, error } = await this.client.from('bulletin_posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(80);
    if (error) return this.notify?.('Не удалось загрузить доску объявлений: ' + error.message);
    const rows = data || [];
    const imperator = this.isImperator?.() === true;
    const html = rows.map(p => {
      const statusLabel = p.status === 'approved' ? 'Опубликовано'
        : p.status === 'rejected' ? 'Отклонено'
        : (String(p.author_id) === String(user.id) ? 'На модерации' : 'На модерации');
      const canMod = imperator && p.status === 'pending';
      const canDel = imperator || String(p.author_id) === String(user.id);
      return `<div class="card" style="margin-bottom:10px">
        <b>${esc(p.title)}</b>
        <div style="white-space:pre-wrap;margin:7px 0">${esc(p.body)}</div>
        <div class="feature-small">${formatDate(p.created_at)} · ${statusLabel}</div>
        <div class="feature-actions" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
          ${canMod ? `<button class="primary-btn" type="button" data-rim-bulletin="approve" data-id="${esc(p.id)}">Одобрить</button>
          <button class="action-btn danger-btn" type="button" data-rim-bulletin="reject" data-id="${esc(p.id)}">Отклонить</button>` : ''}
          ${canDel ? `<button class="action-btn danger-btn" type="button" data-rim-bulletin="delete" data-id="${esc(p.id)}">Удалить</button>` : ''}
        </div>
      </div>`;
    }).join('');

    this.showModal(`<h2 class="modal-title">📜 Имперская доска объявлений</h2>
      <div class="feature-banner" style="margin-bottom:10px">Запрещены мошеннические объявления. Разрешены приглашения в каналы и поиск людей с общими интересами.</div>
      <button class="primary-btn" style="width:100%;margin-bottom:10px" type="button" data-rim-bulletin="create">＋ Разместить объявление</button>
      ${html || '<div class="empty-state">Объявлений пока нет.</div>'}
      <button class="action-btn" style="width:100%;margin-top:10px" type="button" onclick="closeModal()">Закрыть</button>`);
    this.#bindBulletin();
  }

  #bindBulletin() {
    const root = this.window?.document?.getElementById?.('modalRoot');
    if (!root || root.dataset.rimBulletinBound) return;
    root.dataset.rimBulletinBound = '1';
    root.addEventListener('click', async (event) => {
      const btn = event.target?.closest?.('[data-rim-bulletin]');
      if (!btn) return;
      const action = btn.dataset.rimBulletin;
      const id = btn.dataset.id;
      if (action === 'create') return this.createBulletin();
      if (action === 'approve') return this.moderateBulletin(id, 'approved');
      if (action === 'reject') return this.moderateBulletin(id, 'rejected');
      if (action === 'delete') return this.deleteBulletin(id);
    });
  }

  async createBulletin() {
    const user = this.#user();
    if (!user?.id) return;
    const title = this.window.prompt?.('Заголовок объявления:');
    if (!title?.trim()) return;
    const body = this.window.prompt?.('Текст объявления:');
    if (!body?.trim()) return;
    const { error } = await this.client.from('bulletin_posts').insert({
      author_id: user.id,
      title: title.trim(),
      body: body.trim(),
      status: 'pending'
    });
    if (error) return this.notify?.('Не удалось отправить объявление: ' + error.message);
    this.notify?.('Объявление отправлено на модерацию.');
    return this.openBulletinBoard();
  }

  async moderateBulletin(id, status) {
    if (!this.isImperator?.()) return this.notify?.('Недостаточно прав.');
    const { error } = await this.client.from('bulletin_posts')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return this.notify?.('Не удалось изменить статус: ' + error.message);
    return this.openBulletinBoard();
  }

  async deleteBulletin(id) {
    if (!this.window.confirm?.('Удалить объявление?')) return;
    const { error } = await this.client.from('bulletin_posts').delete().eq('id', id);
    if (error) return this.notify?.('Не удалось удалить: ' + error.message);
    return this.openBulletinBoard();
  }

  async openNotifications() {
    const user = this.#user();
    if (!user?.id) return this.notify?.('Нужен вход в аккаунт.');
    const { data, error } = await this.client.from('app_notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60);
    if (error) return this.notify?.('Не удалось загрузить уведомления: ' + error.message);
    const rows = data || [];
    const html = rows.map(n => `<div class="feature-comment" style="opacity:${n.is_read ? '.65' : '1'};margin-bottom:8px">
      <b>${esc(n.title)}</b>
      <div style="font-size:13px;margin:4px 0">${esc(n.body || '')}</div>
      <div class="feature-small">${formatDate(n.created_at)}</div>
    </div>`).join('');
    this.showModal(`<h2 class="modal-title">🔔 Уведомления</h2>
      ${html || '<div class="empty-state">Пока нет уведомлений.</div>'}
      <button class="primary-btn" style="width:100%;margin-top:12px" type="button" onclick="closeModal()">Закрыть</button>`);
  }

  async openAchievements() {
    const user = this.#user();
    if (!user?.id) return this.notify?.('Нужен вход в аккаунт.');
    const { data, error } = await this.client.from('user_achievements')
      .select('awarded_at,achievements(id,code,title,description,icon)')
      .eq('user_id', user.id)
      .order('awarded_at', { ascending: false });
    if (error) return this.notify?.('Не удалось загрузить достижения: ' + error.message);
    const rows = data || [];
    const html = rows.map(x => {
      const a = x.achievements || {};
      return `<div class="achievement" style="display:flex;gap:10px;margin-bottom:10px">
        <div class="achievement-icon">${esc(a.icon || '🏅')}</div>
        <div><b>${esc(a.title || a.code || 'Достижение')}</b>
        <div class="feature-small">${esc(a.description || '')} · ${formatDate(x.awarded_at)}</div></div>
      </div>`;
    }).join('');
    this.showModal(`<h2 class="modal-title">🏅 Достижения</h2>
      ${html || '<div class="empty-state">Пока нет полученных достижений.</div>'}
      <button class="primary-btn" style="width:100%;margin-top:12px" type="button" onclick="closeModal()">Закрыть</button>`);
  }

  async openMemberCard() {
    const user = this.#user();
    if (!user?.id) return this.notify?.('Нужен вход в аккаунт.');
    const { data, error } = await this.client.from('profiles')
      .select('username,display_name,member_number,created_at,name_color')
      .eq('id', user.id)
      .maybeSingle();
    if (error) return this.notify?.('Не удалось открыть удостоверение: ' + error.message);
    const p = data || {};
    const created = p.created_at ? new Date(p.created_at).toLocaleDateString('ru-RU') : '—';
    this.showModal(`<h2 class="modal-title">🪪 Имперское удостоверение</h2>
      <div class="member-id" style="text-align:center;padding:12px">
        <div style="font-size:28px">⚜</div>
        <div class="serial">RIM · MEMBER</div>
        <h2 style="color:var(--gold2);margin:12px 0 5px">${esc(p.display_name || p.username || 'Участник')}</h2>
        <div>@${esc(p.username || '')}</div>
        <hr style="border-color:var(--border);margin:14px 0">
        <div class="serial">НОМЕР УЧАСТНИКА</div>
        <div style="font-size:23px;font-weight:bold;margin:5px 0">${p.member_number ?? 'Не присвоен'}</div>
        <div class="feature-small">В системе с ${created}</div>
      </div>
      <button class="primary-btn" style="width:100%;margin-top:12px" type="button" onclick="closeModal()">Закрыть</button>`);
  }

  openNotificationSettings() {
    this.showModal(`<h2 class="modal-title">⚙ Оповещения</h2>
      <p class="muted">Настройки push и типов оповещений появятся здесь. Пока используйте системные разрешения браузера.</p>
      <button class="primary-btn" style="width:100%;margin-top:12px" type="button" onclick="closeModal()">Закрыть</button>`);
  }

  bindGlobals() {
    const win = this.window;
    win.openBulletinBoard = () => this.openBulletinBoard();
    win.openNotifications = () => this.openNotifications();
    win.openAchievements = () => this.openAchievements();
    win.openMemberCard = () => this.openMemberCard();
    win.openNotificationSettings = () => this.openNotificationSettings();
    win.rimOpenBlocks = () => {
      this.showModal(`<h2 class="modal-title">🚫 Чёрный список</h2>
        <p class="muted">Управление блокировками пользователей.</p>
        <button class="primary-btn" style="width:100%;margin-top:12px" type="button" onclick="closeModal()">Закрыть</button>`);
    };
  }
}
