import { escapeHtml } from '../core/html.js';

const CHANNEL_SCOPE_ALL = 'all';
const CHANNEL_SCOPE_SUBSCRIBED = 'subscribed';

export function normalizeChannelScope(value) {
  return value === CHANNEL_SCOPE_SUBSCRIBED ? CHANNEL_SCOPE_SUBSCRIBED : CHANNEL_SCOPE_ALL;
}


export function renderChannelDirectoryRows(channels, subscribedIds, scope = CHANNEL_SCOPE_ALL, query = '', category = 'all') {
  const subscribed = subscribedIds instanceof Set ? subscribedIds : new Set((subscribedIds || []).map(String));
  const term = String(query || '').trim().toLocaleLowerCase('ru');
  const rows = (channels || []).filter(channel =>
    (normalizeChannelScope(scope) !== CHANNEL_SCOPE_SUBSCRIBED || subscribed.has(String(channel.id))) &&
    (category === 'all' || String(channel.catalog_category || '') === category) &&
    (!term || `${channel.title || ''} ${channel.username || ''} ${channel.description || ''} ${channel.catalog_category || ''}`.toLocaleLowerCase('ru').includes(term))
  );

  if (!rows.length) {
    const message = term ? 'По запросу ничего не найдено.' : normalizeChannelScope(scope) === CHANNEL_SCOPE_SUBSCRIBED
      ? 'Вы ещё не подписаны на каналы.' : 'Каналов пока нет.';
    return `<div class="empty-state rim-channel-empty">${message}</div>`;
  }

  return rows.map(channel => {
    const id = escapeHtml(channel.id);
    const isSubscribed = subscribed.has(String(channel.id));
    const visibility = channel.is_public ? 'Публичный канал' : 'Закрытый канал';
    const username = channel.username ? `@${escapeHtml(channel.username)}` : '';
    const category = channel.catalog_category ? `<span class="rim-channel-category">${escapeHtml(channel.catalog_category)}</span>` : '';
    const action = isSubscribed
      ? `<button class="action-btn rim-channel-open" type="button" data-rim-channel-action="open" data-channel-id="${id}">Открыть</button>`
      : channel.is_public
        ? `<button class="primary-btn" type="button" data-rim-channel-action="join" data-channel-id="${id}">Подписаться</button>`
        : '<small class="rim-channel-invite">По приглашению</small>';
    const avatar = channel.avatar_url
      ? `<img src="${escapeHtml(channel.avatar_url)}" alt="" loading="lazy">`
      : `<span>${escapeHtml(String(channel.title || 'К').trim().slice(0, 1).toLocaleUpperCase('ru') || 'К')}</span>`;
    const created = channel.created_at ? new Date(channel.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    return `<article class="rim-channel-row rim-channel-card" data-rim-channel-action="open" data-channel-id="${id}" tabindex="0"><div class="rim-channel-avatar">${avatar}</div><div class="rim-channel-copy"><div class="rim-channel-title-line"><div class="rim-channel-name">${escapeHtml(channel.title || 'Канал')}</div>${isSubscribed ? '<span class="rim-channel-subscribed">✓ Подписка</span>' : ''}</div><div class="rim-channel-handle">${username || visibility}</div><div class="rim-channel-description">${escapeHtml(channel.description || 'Описание канала пока не добавлено.')}</div><div class="rim-channel-meta"><span>${visibility}</span>${category}${created ? `<span>Создан ${escapeHtml(created)}</span>` : ''}</div></div><div class="rim-channel-row-actions">${action}</div></article>`;
  }).join('');
}

/** Owns the channel-directory read model and its existing list/filter UI. */
export class ChannelDirectoryController {
  constructor({ repository, getUser, documentRef = globalThis.document, windowRef = globalThis.window, logger = null }) {
    this.repository = repository;
    this.getUser = getUser;
    this.document = documentRef;
    this.window = windowRef;
    this.logger = logger;
    this.scope = CHANNEL_SCOPE_ALL;
    this.query = '';
    this.category = 'all';
    this.channels = [];
    this.subscribedIds = new Set();
    this.requestSequence = 0;
    this.boundList = null;
    this.listKeyHandler = event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const row = event.target?.closest?.('.rim-channel-card[data-channel-id]');
      if (!row || !this.boundList?.contains?.(row) || event.target?.closest?.('button')) return;
      event.preventDefault?.();
      this.window?.openChannel?.(row.dataset.channelId);
    };
    this.listClickHandler = event => {
      const button = event.target?.closest?.('[data-rim-channel-action]');
      if (!button || !this.boundList?.contains?.(button)) return;
      const id = button.dataset.channelId;
      if (!id) return;
      if (button.dataset.rimChannelAction === 'open') this.window?.openChannel?.(id);
      if (button.dataset.rimChannelAction === 'join') this.window?.rimJoinChannel?.(id);
    };
  }

  getList() { return this.document?.getElementById?.('channelList') || null; }

  ensureFilterControl() {
    const section = this.document?.getElementById?.('channelsSection');
    const list = this.getList();
    if (!section || !list) return null;
    let search = this.document.getElementById('rimChannelSearch');
    if (!search) {
      search = this.document.createElement('input');
      search.id = 'rimChannelSearch';
      search.className = 'field rim-channel-search';
      search.type = 'search';
      search.placeholder = 'Найти канал по названию или описанию';
      section.insertBefore(search, list);
      search.addEventListener('input', () => { this.query = search.value; this.render(); });
    }
    let filters = this.document.getElementById('rimChannelCategoryFilters');
    if (!filters) {
      filters = this.document.createElement('div');
      filters.id = 'rimChannelCategoryFilters';
      filters.className = 'rim-channel-category-filters';
      filters.setAttribute?.('aria-label', 'Категории каналов');
      section.insertBefore(filters, list);
      filters.addEventListener('click', event => {
        const button = event.target?.closest?.('[data-rim-channel-category]');
        if (!button || !filters.contains(button)) return;
        this.category = button.dataset.rimChannelCategory || 'all';
        this.render();
      });
    }
    let select = this.document.getElementById('rimChannelScope');
    if (!select) {
      select = this.document.createElement('select');
      select.id = 'rimChannelScope';
      select.className = 'field rim-channel-subscribe-select';
      select.innerHTML = '<option value="all">Все доступные каналы</option><option value="subscribed">Только мои подписки</option>';
      section.insertBefore(select, list);
      select.addEventListener('change', () => { void this.setScope(select.value); });
    }
    select.value = this.scope;
    return select;
  }

  render() {
    const filters = this.document?.getElementById?.('rimChannelCategoryFilters');
    if (filters) {
      const categories = [...new Set(this.channels.map(channel => String(channel.catalog_category || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
      const values = ['all', ...categories];
      if (this.category !== 'all' && !categories.includes(this.category)) this.category = 'all';
      filters.innerHTML = values.map(value => {
        const label = value === 'all' ? 'Все категории' : escapeHtml(value);
        const selected = value === this.category ? ' active' : '';
        return `<button type="button" class="rim-channel-category-filter${selected}" data-rim-channel-category="${value === 'all' ? 'all' : escapeHtml(value)}" aria-pressed="${value === this.category}">${label}</button>`;
      }).join('');
    }
    const list = this.getList();
    if (list) list.innerHTML = renderChannelDirectoryRows(this.channels, this.subscribedIds, this.scope, this.query, this.category);
  }

  bindList(list) {
    if (this.boundList === list) return;
    this.boundList?.removeEventListener?.('click', this.listClickHandler);
    this.boundList?.removeEventListener?.('keydown', this.listKeyHandler);
    this.boundList = list;
    this.boundList?.addEventListener?.('click', this.listClickHandler);
    this.boundList?.addEventListener?.('keydown', this.listKeyHandler);
  }

  async setScope(scope) {
    this.scope = normalizeChannelScope(scope);
    const select = this.document?.getElementById?.('rimChannelScope');
    if (select) select.value = this.scope;
    return this.load();
  }

  async load() {
    const list = this.getList();
    const user = this.getUser?.();
    if (!list) return [];
    this.ensureFilterControl();
    this.bindList(list);

    const sequence = ++this.requestSequence;
    if (!user?.id) {
      list.innerHTML = '<div class="notice">Не удалось определить пользователя.</div>';
      return [];
    }

    list.innerHTML = '<div class="feature-small">Загрузка каналов…</div>';
    try {
      const result = await this.repository.getDirectory(user.id);
      if (sequence !== this.requestSequence) return [];
      if (!result.ok) throw result.error;
      const { channels, subscribedChannelIds } = result.value;
      this.channels = channels || [];
      this.subscribedIds = new Set(subscribedChannelIds || []);
      this.render();
      return this.channels;
    } catch (error) {
      if (sequence !== this.requestSequence) return [];
      this.logger?.warn?.('channels.directory.load.failed', { message: error?.message });
      list.innerHTML = `<div class="notice">${escapeHtml(error?.message || 'Не удалось загрузить каналы.')}</div>`;
      return [];
    }
  }

  invalidate() { this.requestSequence++; }
  dispose() {
    this.invalidate();
    this.boundList?.removeEventListener?.('click', this.listClickHandler);
    this.boundList?.removeEventListener?.('keydown', this.listKeyHandler);
    this.boundList = null;
  }
}
