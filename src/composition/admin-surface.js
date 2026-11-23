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
  e2eDiagnostics = null,
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


  win.rimLoadE2EDiagnostics = async () => {
    const out = doc.getElementById('rimE2EDiagnostics');
    if (!out) return;
    await imperialSession.loadRole?.();
    if (!imperialSession.isImperator()) { out.textContent = 'Доступ закрыт.'; return; }
    out.textContent = 'Загрузка событий E2E…';
    try {
      const rows = await e2eDiagnostics?.listRecent?.({ limit: 100 });
      if (!rows) throw new Error('Диагностический сборщик не подключён.');
      const counts = new Map();
      for (const row of rows) { const key = `${row.event}:${row.status}`; counts.set(key, (counts.get(key) || 0) + 1); }
      const summary = [...counts.entries()].sort((a,b) => b[1]-a[1]).map(([key,count]) => `<span class="rim-update-muted">${escapeHtml(key)}: <b>${count}</b></span>`).join(' · ');
      const errors = rows.filter(row => row.status === 'error').length;
      const warnings = rows.filter(row => row.status === 'warning').length;
      const latencies = rows.map(row => Number(row.latency_ms)).filter(value => Number.isFinite(value) && value >= 0);
      const averageLatency = latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null;
      const healthSummary = `<div class="rim-update-muted">Ошибок: <b>${errors}</b> · предупреждений: <b>${warnings}</b> · средняя измеренная задержка: <b>${averageLatency == null ? '—' : `${averageLatency} ms`}</b></div>`;
      const details = rows.slice(0, 30).map(row => `<div class="rim-admin-user"><div><b>${escapeHtml(row.event)} · ${escapeHtml(row.status)}</b><small>${escapeHtml(row.created_at)} · user ${escapeHtml(String(row.user_id).slice(0,8))} · device ${escapeHtml(row.device_id)}</small><small>${escapeHtml(row.code || row.metadata?.phase || row.metadata?.verification || '—')} · ${row.latency_ms == null ? '—' : `${escapeHtml(row.latency_ms)} ms`}</small></div></div>`).join('');
      out.innerHTML = `${healthSummary}<div class="rim-update-muted">Последние ${rows.length} событий. Сводка: ${summary || 'событий пока нет'}</div>${details || '<div class="empty-state">Диагностических событий пока нет.</div>'}`;
      return rows;
    } catch (error) { out.textContent = `Не удалось загрузить E2E-диагностику: ${error?.message || error}`; }
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
      ['Новые за 7 дней', data.users_new_7d],
      ['Новые за 30 дней', data.users_new_30d],
      ['Активны за 24 часа', data.users_active_24h],
      ['Активны за 30 дней · оценка MAU', data.users_active_30d],
      ['С паролем RIM', data.users_with_password],
      ['С секретной фразой', data.users_with_recovery_phrase],
      ['С кодами восстановления', data.users_with_recovery_codes],
      ['Попытки восстановления за 24 ч.', data.recovery_attempts_24h],
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
      ['Треки в облаке', data.music_tracks_total],
      ['Запуски музыки', data.music_plays_total],
      ['Время музыки', Math.floor(Number(data.music_listened_seconds || 0) / 3600) + ' ч'],
      ['Вход через Telegram', data.auth_providers?.telegram || 0],
      ['Вход через Google', data.auth_providers?.google || 0],
      ['Вход через почту', data.auth_providers?.email || 0],
      ['Оплачено по договорам', Number(data.paid_contracts_total || 0).toLocaleString('ru-RU') + ' ₽']
    ];
    win.__rimAnalyticsRows = result.value.series || [];
    const formatBytes = value => {
      const bytes = Math.max(0, Number(value) || 0);
      if (bytes < 1024) return `${bytes} Б`;
      const units = ['КБ', 'МБ', 'ГБ', 'ТБ'];
      let size = bytes / 1024; let unit = 0;
      while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
      return `${size.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ${units[unit]}`;
    };
    const usageCard = (label, used, limit) => {
      const safeUsed = Math.max(0, Number(used) || 0);
      const safeLimit = Math.max(1, Number(limit) || 1);
      const percent = Math.min(100, safeUsed / safeLimit * 100);
      const status = percent >= 90 ? 'critical' : percent >= 75 ? 'warning' : 'normal';
      return `<div class="rim-usage-card" data-usage-state="${status}"><div class="rim-usage-head"><b>${label}</b><strong>${formatBytes(safeUsed)} / ${formatBytes(safeLimit)}</strong></div><div class="rim-usage-track"><span style="width:${percent.toFixed(2)}%"></span></div><div class="feature-small">${percent.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}% занято · ${formatBytes(Math.max(0, safeLimit-safeUsed))} свободно</div></div>`;
    };
    const usage = `<section class="rim-admin-usage"><div class="rim-admin-section-title">Ресурсы проекта Supabase</div><div class="rim-usage-grid">${usageCard('База данных', data.database_size_bytes, data.database_quota_bytes)}${usageCard('Файловое хранилище', data.storage_bytes, data.storage_quota_bytes)}</div><div class="feature-small">Объектов Storage: ${escapeHtml(data.storage_objects ?? '—')} · Публичных таблиц: ${escapeHtml(data.public_tables ?? '—')}. Квоты отображаются как справочные значения тарифа Free; фактические биллинговые показатели и трафик сверяйте в панели Supabase.</div></section>`;
    const bucketRows = Array.isArray(data.storage_by_bucket) ? data.storage_by_bucket : [];
    const bucketHtml = bucketRows.length ? `<div class="rim-admin-bucket-list">${bucketRows.map(bucket => `<div><span>${escapeHtml(bucket.bucket_id)}</span><b>${formatBytes(bucket.bytes)} · ${escapeHtml(bucket.objects)} объектов</b></div>`).join('')}</div>` : '';
    const tableRows = Array.isArray(data.database_table_sizes) ? data.database_table_sizes : [];
    const tableHtml = tableRows.length ? `<section class="rim-admin-usage"><div class="rim-admin-section-title">Крупнейшие таблицы базы</div><div class="rim-admin-bucket-list">${tableRows.map(table => `<div><span>${escapeHtml(table.schema)}.${escapeHtml(table.table)}</span><b>${formatBytes(table.bytes)}</b></div>`).join('')}</div></section>` : '';
    const quotaNote = `<div class="feature-small">Оценка MAU — число пользователей с входом за последние 30 дней, а не официальный биллинговый счётчик. Метрики egress, вызовов Edge Functions и Realtime требуют платформенного Usage API; текущий тарифный SQL-доступ их не раскрывает.</div>`;
    out.innerHTML = `<div class="rim-stats-grid">${items.map(([label, value]) =>
      `<div class="rim-stat-item"><div class="feature-small">${escapeHtml(label)}</div><b>${escapeHtml(value ?? '—')}</b></div>`
    ).join('')}</div>${usage}${bucketHtml}${tableHtml}${quotaNote}`;
    return result;
  };

  function renderAdminUserRow(x, { sessionsButton = false } = {}) {
    const id = escHtml(x.user_id);
    const role = x.role || 'user';
    const sessions = sessionsButton
      ? `<button class="action-btn" type="button" onclick="rimAdminShowUserSessions('${id}')">Сеансы</button>`
      : '';
    const actionLabel = sessionsButton ? 'Роль' : 'Сохранить';
    const providers = Array.isArray(x.providers) && x.providers.length ? x.providers.map(value => escHtml(value)).join(', ') : 'не определён';
    const passwordState = x.has_password ? 'пароль установлен' : 'без пароля';
    const recoveryState = x.recovery_phrase_enabled ? 'фраза настроена' : 'фразы нет';
    const codesState = x.recovery_codes_enabled ? 'коды настроены' : 'кодов нет';
    return `<div class="rim-admin-user"><div><b>${escHtml(x.display_name || x.username || 'Пользователь')}</b><small>@${escHtml(x.username || '—')} · ${escHtml(x.email || 'email скрыт')}</small><small class="rim-admin-user-security">Вход: ${providers} · ${passwordState} · ${recoveryState} · ${codesState}</small></div><div class="rim-admin-user-actions"><select class="field" id="rimRole-${id}"><option value="user" ${role === 'user' ? 'selected' : ''}>Пользователь</option><option value="moderator" ${role === 'moderator' ? 'selected' : ''}>Модератор</option><option value="admin" ${role === 'admin' ? 'selected' : ''}>Администратор</option><option value="superadmin" ${role === 'superadmin' ? 'selected' : ''}>Суперадмин</option></select><button class="action-btn" type="button" onclick="rimAdminSetRole('${id}')">${actionLabel}</button>${sessions}</div></div>`;
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
        <h3>Лаборатория E2E · автоматическая диагностика</h3>
        <p class="feature-small">События Signal SDK, Relay, шифрования и расшифровки. Содержимое сообщений, ключи и ciphertext сюда не записываются.</p>
        <button class="action-btn" type="button" onclick="rimLoadE2EDiagnostics()">Обновить диагностику</button>
        <div id="rimE2EDiagnostics" style="margin-top:8px">Загрузка…</div>
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
    void win.rimLoadE2EDiagnostics?.();
  };

  lifecycle?.add?.(() => { win.__RIM_ADMIN_COMMANDS_OWNED = false; });
  logger?.info?.('composition.adminSurface.bound', {});
  return { imperialSession, adminCommands };
}
