import { escapeHtml } from '../core/html.js';

const CHANNEL_SCOPE_ALL = 'all';
const CHANNEL_SCOPE_SUBSCRIBED = 'subscribed';

export function normalizeChannelScope(value) {
  return value === CHANNEL_SCOPE_SUBSCRIBED ? CHANNEL_SCOPE_SUBSCRIBED : CHANNEL_SCOPE_ALL;
}


export function renderChannelDirectoryRows(channels, subscribedIds, scope = CHANNEL_SCOPE_ALL) {
  const subscribed = subscribedIds instanceof Set ? subscribedIds : new Set((subscribedIds || []).map(String));
  const rows = (channels || []).filter(channel =>
    normalizeChannelScope(scope) !== CHANNEL_SCOPE_SUBSCRIBED || subscribed.has(String(channel.id))
  );

  if (!rows.length) {
    const message = normalizeChannelScope(scope) === CHANNEL_SCOPE_SUBSCRIBED
      ? 'Вы ещё не подписаны на каналы.'
      : 'Каналов пока нет.';
    return `<div class="empty-state">${message}</div>`;
  }

  return rows.map(channel => {
    const id = escapeHtml(channel.id);
    const isSubscribed = subscribed.has(String(channel.id));
    const visibility = channel.is_public ? 'Публичный' : 'Закрытый';
    const username = channel.username ? ` · @${escapeHtml(channel.username)}` : '';
    const subscription = isSubscribed ? ' · Вы подписаны' : '';
    const action = isSubscribed
      ? `<button class="action-btn rim-channel-open" type="button" data-rim-channel-action="open" data-channel-id="${id}">Открыть</button>`
      : channel.is_public
        ? `<button class="action-btn" type="button" data-rim-channel-action="join" data-channel-id="${id}">Подписаться</button>`
        : '<small>По приглашению</small>';

    return `<article class="rim-channel-row" data-rim-channel-action="open" data-channel-id="${id}" role="button" tabindex="0"><div class="rim-channel-avatar">⚜</div><div class="rim-channel-copy"><div class="rim-channel-name">${escapeHtml(channel.title || 'Канал')}</div><div class="rim-channel-description">${escapeHtml(channel.description || 'Без описания')}</div><div class="rim-channel-meta">${visibility}${username}${subscription}</div></div><div class="rim-channel-row-actions">${action}</div></article>`;
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
    this.requestSequence = 0;
    this.boundList = null;
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

  bindList(list) {
    if (this.boundList === list) return;
    this.boundList?.removeEventListener?.('click', this.listClickHandler);
    this.boundList = list;
    this.boundList?.addEventListener?.('click', this.listClickHandler);
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
      list.innerHTML = renderChannelDirectoryRows(channels, new Set(subscribedChannelIds), this.scope);
      return channels;
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
    this.boundList = null;
  }
}
