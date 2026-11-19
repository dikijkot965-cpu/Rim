import { escapeHtml } from '../core/html.js';
/**
 * Composition: imperial session + admin command window routes.
 */
import { ImperialSessionController } from '../application/imperial-session-controller.js';
import { AdminCommandService } from '../application/admin-command-service.js';

function reportAdminCommand(result, { notify, logger } = {}) {
  if (!result) return result;
  if (!result.ok) {
    const message = result.error?.message || result.error || 'Админ-операция не выполнена.';
    notify?.(String(message));
    logger?.warn?.('admin.command.failed', { message: String(message) });
  }
  return result;
}

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

/**
 * @param {object} deps
 */
export function bindAdminSurface({
  client,
  getUser,
  notify,
  logger,
  container,
  lifecycle,
  documentRef = globalThis.document,
  windowRef = globalThis.window
} = {}) {
  const win = windowRef;
  const doc = documentRef;

  const imperialSession = new ImperialSessionController({
    client,
    getUser,
    logger
  });
  container?.value?.('imperialSession', imperialSession);
  win.__RIM_IMPERIAL_SESSION_OWNED = true;
  win.loadImperialRole = () => imperialSession.loadRole();
  win.isImperator = () => imperialSession.isImperator();
  lifecycle?.add?.(() => {
    win.__RIM_IMPERIAL_SESSION_OWNED = false;
    imperialSession.dispose?.();
  });

  const adminCommands = new AdminCommandService({
    client,
    getUser,
    canManage: () => imperialSession.isImperator(),
    notify,
    logger
  });
  container?.value?.('adminCommands', adminCommands);
  win.__RIM_ADMIN_COMMANDS_OWNED = true;

  const report = result => reportAdminCommand(result, { notify, logger });

  win.rimToggleAds = async enabled => {
    const result = report(await adminCommands.toggleAds(enabled));
    if (result?.ok) {
      const status = doc.getElementById('rimAdsGlobalStatus');
      if (status) status.textContent = enabled ? 'Реклама включена.' : 'Реклама отключена.';
      const checkbox = doc.getElementById('rimAdsEnabled');
      if (checkbox) checkbox.checked = !!enabled;
      notify?.(enabled ? 'Реклама включена.' : 'Вся реклама отключена.');
    } else {
      const checkbox = doc.getElementById('rimAdsEnabled');
      if (checkbox) checkbox.checked = !enabled;
    }
    return result;
  };

  win.rimAdminSetRole = async id => {
    const role = doc.getElementById('rimRole-' + id)?.value;
    const result = report(await adminCommands.setUserRole(id, role));
    if (result?.ok) {
      notify?.('Роль изменена.');
      if (typeof win.rimLoadAdminUsers === 'function') await win.rimLoadAdminUsers();
      if (typeof win.adminUsersLoad === 'function') await win.adminUsersLoad();
    }
    return result;
  };

  win.rimSaveAd = async () => {
    const selected = doc.querySelector('input[name="rimAdChannel"]:checked')?.value || null;
    const result = report(await adminCommands.saveAd({
      title: doc.getElementById('rimAdTitle')?.value,
      body: doc.getElementById('rimAdBody')?.value,
      url: doc.getElementById('rimAdUrl')?.value,
      channelId: selected,
      imageFile: doc.getElementById('rimAdImage')?.files?.[0] || null,
      amount: doc.getElementById('rimAdAmount')?.value,
      paymentStatus: doc.getElementById('rimAdPayment')?.value || 'unpaid'
    }));
    if (result?.ok) {
      if (result.value?.warning) notify?.(result.value.warning);
      else notify?.('Рекламная кампания создана.');
      await win.rimLoadAdsAdmin?.();
    }
    return result;
  };

  win.rimLoadAdsAdmin = async () => {
    const out = doc.getElementById('rimAdsList');
    if (!out) return;
    const result = await adminCommands.listCampaigns();
    if (!result.ok) {
      out.textContent = 'Не удалось загрузить кампании: ' + (result.error?.message || result.error);
      return result;
    }
    const ads = result.value || [];
    if (!ads.length) {
      out.innerHTML = '<div class="empty-state">Кампаний пока нет.</div>';
      return result;
    }
    out.innerHTML = ads.map(ad => {
      const title = escHtml(ad.title || 'Кампания');
      const status = escHtml(ad.status || '');
      return `<div class="card"><b>${title}</b><div class="feature-small">${status}</div></div>`;
    }).join('');
    return result;
  };

  win.rimAdminSendNotice = async () => {
    const result = report(await adminCommands.sendNotice({
      username: doc.getElementById('rimNoticeUsername')?.value,
      title: doc.getElementById('rimNoticeTitle')?.value,
      body: doc.getElementById('rimNoticeBody')?.value
    }));
    if (result?.ok) {
      notify?.(`Обращение отправлено: ${result.value} получателей.`);
      const u = doc.getElementById('rimNoticeUsername');
      const t = doc.getElementById('rimNoticeTitle');
      const b = doc.getElementById('rimNoticeBody');
      if (u) u.value = '';
      if (t) t.value = '';
      if (b) b.value = '';
    }
    return result;
  };

  win.rimLoadStats = async () => {
    const out = doc.getElementById('rimStats');
    if (!out) return;
    out.innerHTML = '<div class="loading">Загрузка статистики…</div>';
    const result = await adminCommands.dashboardStats({ days: 14 });
    if (!result.ok) {
      out.innerHTML = `<div class="notice">${escHtml(result.error?.message || result.error || 'ошибка')}</div>`;
      return result;
    }
    const data = result.value.stats || {};
    const items = [
      ['Аккаунты', data.users_total],
      ['Активны за 24 часа', data.users_active_24h],
      ['Активные сеансы', data.sessions_active],
      ['Сеансы за 24 часа', data.sessions_24h],
      ['Каналы', data.channels_total],
      ['Группы', data.groups_total],
      ['Личные чаты', data.direct_chats_total],
      ['Сообщения', data.messages_total],
      ['Комментарии', data.comments_total],
      ['Опросы', data.polls_total],
      ['Голоса', data.poll_votes_total],
      ['Новые жалобы', data.reports_new],
      ['Рекламные кампании', data.ads_total],
      ['Показы рекламы за 24 ч.', data.ad_impressions_24h],
      ['Переходы за 24 ч.', data.ad_clicks_24h],
      ['События аналитики за 24 ч.', data.events_24h],
      ['Оплачено по договорам', Number(data.paid_contracts_total || 0).toLocaleString('ru-RU') + ' ₽']
    ];
    win.__rimAnalyticsRows = result.value.series || [];
    out.innerHTML = `<div class="rim-stats-grid">${items.map(([label, value]) =>
      `<div class="rim-stat-item"><div class="feature-small">${escapeHtml(label)}</div><b>${escapeHtml(value ?? '—')}</b></div>`
    ).join('')}</div>`;
    return result;
  };

  function renderAdminUserRow(x, { sessionsButton = false } = {}) {
    const id = escHtml(x.user_id);
    const role = x.role || 'user';
    const sessions = sessionsButton
      ? `<button class="action-btn" type="button" onclick="rimAdminShowUserSessions('${id}')">Сеансы</button>`
      : '';
    const actionLabel = sessionsButton ? 'Роль' : 'Сохранить';
    return `<div class="rim-admin-user"><div><b>${escHtml(x.display_name || x.username || 'Пользователь')}</b><small>@${escHtml(x.username || '—')} · ${escHtml(x.email || 'email скрыт')}</small></div><div class="rim-admin-user-actions"><select class="field" id="rimRole-${id}"><option value="user" ${role === 'user' ? 'selected' : ''}>Пользователь</option><option value="moderator" ${role === 'moderator' ? 'selected' : ''}>Модератор</option><option value="admin" ${role === 'admin' ? 'selected' : ''}>Администратор</option><option value="superadmin" ${role === 'superadmin' ? 'selected' : ''}>Суперадмин</option></select><button class="action-btn" type="button" onclick="rimAdminSetRole('${id}')">${actionLabel}</button>${sessions}</div></div>`;
  }

  win.rimLoadAdminUsers = async () => {
    const out = doc.getElementById('rimAdminUsersList');
    if (!out) return;
    out.textContent = 'Загрузка пользователей…';
    const result = await adminCommands.listUsers({ limit: 150, offset: 0 });
    if (!result.ok) {
      out.textContent = 'Не удалось получить пользователей: ' + (result.error?.message || result.error);
      return result;
    }
    const rows = result.value || [];
    if (!rows.length) {
      out.innerHTML = '<div class="empty-state">Пользователей нет.</div>';
      return result;
    }
    out.innerHTML = rows.map(x => renderAdminUserRow(x)).join('');
    return result;
  };

  win.rimFindAdChannels = async () => {
    const out = doc.getElementById('rimAdChannelResults');
    if (!out) return;
    const q = doc.getElementById('rimAdSearch')?.value || '';
    const result = await adminCommands.findAdChannels(q);
    if (!result.ok) {
      out.innerHTML = `<div class="feature-small">${escHtml(result.error?.message || result.error)}</div>`;
      return result;
    }
    const rows = result.value || [];
    if (!rows.length) {
      out.innerHTML = '<div class="empty-state">Каналы не найдены.</div>';
      return result;
    }
    out.innerHTML = rows.map(c =>
      `<label class="rim-search-result"><input type="radio" name="rimAdChannel" value="${escHtml(c.id)}"><span><b>${escHtml(c.title)}</b><small class="feature-small">${c.username ? '@' + escHtml(c.username) : ''}</small></span></label>`
    ).join('');
    return result;
  };

  win.rimAdminUsersMode = async mode => {
    const out = doc.getElementById('rimAdminUsersList');
    if (mode === 'hidden') {
      if (out) out.innerHTML = '<div class="rim-update-muted">Список скрыт.</div>';
      return;
    }
    if (mode === 'search') return win.rimAdminUsersSearch?.();
    return win.rimLoadAdminUsers?.();
  };

  win.rimAdminUsersSearch = async () => {
    const out = doc.getElementById('rimAdminUsersList');
    if (!out) return;
    const q = doc.getElementById('rimAdminUserSearch')?.value || '';
    out.textContent = 'Поиск…';
    const result = await adminCommands.searchUsers(q);
    if (!result.ok) {
      out.innerHTML = `<div class="notice">${escHtml(result.error?.message || result.error)}</div>`;
      return result;
    }
    const rows = result.value || [];
    if (!rows.length) {
      out.innerHTML = '<div class="empty-state">Пользователи не найдены.</div>';
      return result;
    }
    out.innerHTML = rows.map(x => renderAdminUserRow(x, { sessionsButton: true })).join('');
    return result;
  };

  win.rimAdminShowUserSessions = async userId => {
    const result = await adminCommands.listSessions(userId);
    if (!result.ok) {
      notify?.(String(result.error?.message || result.error));
      return result;
    }
    const when = (v) => {
      try { return v ? new Date(v).toLocaleString('ru-RU') : '—'; } catch { return '—'; }
    };
    const rows = result.value || [];
    const html = `<h2 class="modal-title">Активные сеансы пользователя</h2>${rows.map(s => `
    <div class="rim-group-member"><div><b>${escHtml(s.display_name || s.username || s.email || 'Пользователь')}</b>
    <div class="rim-update-muted">${escHtml(s.user_agent || 'Устройство неизвестно')}</div>
    <div class="rim-update-muted">IP: ${escHtml(s.ip || '—')} · Активность: ${when(s.updated_at)}</div></div>
    <button class="action-btn danger-btn" type="button" onclick="rimAdminRevokeSession('${escHtml(s.session_id)}')">Завершить</button></div>`).join('') || '<div class="empty-state">Активных сеансов нет.</div>'}`;
    win.showModal?.(html);
    return result;
  };

  win.rimAdminRevokeSession = async id => {
    const result = report(await adminCommands.revokeSession(id));
    if (result?.ok && !result.value?.cancelled) {
      notify?.('Сеанс завершён.');
      win.closeModal?.();
    }
    return result;
  };


  win.rimAdmin = async () => {
    await imperialSession.loadRole?.();
    if (!imperialSession.isImperator()) {
      notify?.('Доступ закрыт: требуется роль superadmin.');
      return;
    }
    const open = win.fullPage || ((title, body) => {
      const main = doc.querySelector('.main') || doc.body;
      doc.getElementById('rimFullPage')?.remove();
      const root = doc.createElement('section');
      root.className = 'rim-fullpage';
      root.id = 'rimFullPage';
      root.innerHTML = `<header class="rim-page-head"><button type="button" class="icon-btn" onclick="rimClosePage()">‹</button><div class="rim-page-title">${escapeHtml(title)}</div><button type="button" class="icon-btn" onclick="rimClosePage()">×</button></header><div class="rim-page-body">${body}</div>`;
      main.appendChild(root);
    });
    open('Императорская панель', `
      <div class="card">
        <h3>Управление рекламой</h3>
        <p class="feature-small">Кампании, баннеры, ссылки и оплата (вручную).</p>
        <label class="field-label"><input type="checkbox" id="rimAdsEnabled" onchange="rimToggleAds(this.checked)"> Реклама включена глобально</label>
        <div id="rimAdsGlobalStatus" class="feature-small" style="margin-top:8px"></div>
        <input id="rimAdSearch" class="field" placeholder="Найти канал по @username или названию" oninput="rimFindAdChannels()" style="margin-top:10px">
        <div id="rimAdChannelResults" class="ils-list"></div>
        <label class="field-label">Изображение рекламы</label>
        <input id="rimAdImage" class="field" type="file" accept="image/*">
        <label class="field-label">Ссылка перехода</label>
        <input id="rimAdUrl" class="field" type="url" placeholder="https://...">
        <label class="field-label">Сумма договора (₽)</label>
        <input id="rimAdAmount" class="field" type="number" min="0" step="0.01" value="0">
        <label class="field-label">Оплата</label>
        <select id="rimAdPayment" class="field">
          <option value="unpaid">Не оплачено</option>
          <option value="pending">Ожидается</option>
          <option value="paid">Оплачено</option>
          <option value="refunded">Возврат</option>
        </select>
        <button class="primary-btn" style="width:100%;margin-top:8px" type="button" onclick="rimSaveAd()">Сохранить рекламу</button>
      </div>
      <div class="card" style="margin-top:12px">
        <h3>Статистика РИМа</h3>
        <button class="action-btn" type="button" onclick="rimLoadStats()">Обновить статистику</button>
        <div id="rimStats" style="margin-top:8px">Нажмите «Обновить статистику».</div>
      </div>
      <div class="card" style="margin-top:12px">
        <h3>Пользователи</h3>
        <input id="rimAdminUserSearch" class="field" placeholder="Поиск по username / имени / email">
        <div style="display:flex;gap:8px;margin:8px 0;flex-wrap:wrap">
          <button class="action-btn" type="button" onclick="rimAdminUsersMode('search')">Найти</button>
          <button class="action-btn" type="button" onclick="rimLoadAdminUsers?.()">Показать всех</button>
          <button class="action-btn" type="button" onclick="rimAdminUsersMode('hidden')">Свернуть</button>
        </div>
        <div id="rimAdminUsersList" class="ils-list"><div class="rim-update-muted">Введите запрос или покажите всех.</div></div>
      </div>
    `);
  };

  lifecycle?.add?.(() => { win.__RIM_ADMIN_COMMANDS_OWNED = false; });
  logger?.info?.('composition.adminSurface.bound', {});
  return { imperialSession, adminCommands };
}
