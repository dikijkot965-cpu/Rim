import { displayConversationTitle, conversationSubtitle } from '../domain/conversation.js';
import { escapeHtml } from '../core/html.js';
/**
 * Conversation list projection.
 * Resolves peer identity in batches and paints avatars concurrently.
 * The legacy DOM remains the presentation contract until the list renderer is migrated.
 */
export class ConversationListController {
  constructor({
    repository,
    getConversations,
    setConversations = null,
    getUser,
    getActiveConversation = null,
    avatarUrlFor,
    logger,
    documentRef = document,
    windowRef = globalThis.window,
    notify = null
  }) {
    this.repository = repository;
    this.getConversations = getConversations;
    this.setConversations = setConversations;
    this.getUser = getUser;
    this.getActiveConversation = getActiveConversation;
    this.avatarUrlFor = avatarUrlFor;
    this.logger = logger;
    this.document = documentRef;
    this.window = windowRef;
    this.notify = notify || ((message) => {
      const fn = this.window?.toast || this.window?.notify;
      if (typeof fn === 'function') fn(String(message));
      else console.info(String(message));
    });
    this.renderToken = 0;
    this.loadSequence = 0;
  }

  /**
   * Loads membership-scoped conversations into the legacy list state and
   * triggers the existing renderer + avatar enrichment.
   */
  async load() {
    const list = this.document?.getElementById?.('chatList');
    const user = this.getUser?.();
    const sequence = ++this.loadSequence;

    if (list) list.innerHTML = '<div class="loading">Загрузка...</div>';
    if (!user?.id) {
      if (list) list.innerHTML = '<div class="notice">Не удалось определить пользователя.</div>';
      return [];
    }
    if (typeof this.setConversations !== 'function') {
      throw new Error('Conversation list load requires setConversations.');
    }

    try {
      const result = await this.repository.listForUser(user.id);
      if (sequence !== this.loadSequence) return this.getConversations?.() || [];
      if (!result.ok) throw result.error;

      this.setConversations(result.value);
      if (this.window?.__RIM_CONVERSATION_LIST_RENDER_OWNED) {
        this.paintList();
      } else if (typeof this.window?.renderConversationList === 'function') {
        this.window.renderConversationList();
      } else if (list && !result.value.length) {
        list.innerHTML = '<div class="empty-state">Пока нет переписок.<br>Создай новый чат кнопкой ＋</div>';
      }

      // Favorites is a first-party virtual row, not a database conversation.
      // Insert it after whichever renderer owns the current list (modular or legacy).
      this.ensureFavoritesRow();
      this.observeFavoritesRow();
      await this.refresh();
      return result.value;
    } catch (error) {
      if (sequence !== this.loadSequence) return this.getConversations?.() || [];
      this.logger?.warn?.('conversations.list.load.failed', { message: error?.message });
      const message = error?.message || String(error);
      if (list) {
        list.innerHTML = `<div class="notice">Ошибка загрузки переписок: ${escapeHtml(message)}</div>`;
      }
      throw error;
    }
  }

  invalidate() {
    this.loadSequence += 1;
    this.renderToken += 1;
  }

  conversationIdFromNode(node) {
    if (node.dataset.conversationId) return node.dataset.conversationId;
    const handler = node.getAttribute('onclick') || '';
    const match = handler.match(/openConversation\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (match) {
      node.dataset.conversationId = match[1];
      return match[1];
    }
    return null;
  }

  async paintAvatar(node, peer, title, token) {
    if (!node) return;
    const peerId = peer?.id == null ? '' : String(peer.id);
    const signature = `${peerId}:${peer?.avatar_path || ''}:${peer?.avatar_url || ''}`;
    if (node.dataset.rimAvatarSignature === signature && node.dataset.rimAvatarReady === '1') return;
    node.dataset.rimAvatarSignature = signature;
    node.dataset.rimAvatarReady = '0';

    let src = null;
    try { src = await this.avatarUrlFor(peer); }
    catch (error) { this.logger?.warn?.('chat.avatar.resolve.failed', { message: error?.message }); }

    if (token !== this.renderToken || !node.isConnected || node.dataset.rimAvatarSignature !== signature) return;
    node.replaceChildren();
    if (src) {
      const image = this.document.createElement('img');
      image.src = src;
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      image.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit';
      node.append(image);
    } else {
      node.textContent = (title || 'П').trim().slice(0, 1).toUpperCase();
    }
    node.dataset.rimPeerId = peerId;
    node.dataset.rimAvatarReady = '1';
  }

  async refresh() {
    const token = ++this.renderToken;
    const conversations = this.getConversations?.() || [];
    const user = this.getUser?.();
    if (!user || !conversations.length) return;

    const direct = conversations.filter(chat => chat?.type === 'direct');
    const peerFor = chat => [chat?.other_profile, chat?.peer_profile, chat?.other_user]
      .find(peer => peer && (peer.id || peer.username || peer.display_name));
    const unresolved = direct.filter(chat => !peerFor(chat));
    if (unresolved.length) {
      const result = await this.repository.getDirectPeers(unresolved.map(chat => chat.id), user.id, { includePresence: false });
      if (token !== this.renderToken) return;
      if (result.ok) {
        for (const chat of unresolved) {
          const peer = result.value[String(chat.id)];
          if (peer) chat.other_profile = peer;
        }
      } else {
        this.logger?.warn?.('chat.list.peers.failed', { message: result.error?.message });
      }
    }

    const list = this.document.getElementById('chatList');
    if (!list) return;
    const nodes = [...list.querySelectorAll('.chat-item')];
    const conversationsById = new Map(conversations.map(chat => [String(chat.id), chat]));
    const jobs = [];
    for (const node of nodes) {
      const id = this.conversationIdFromNode(node);
      if (!id) continue;
      const chat = conversationsById.get(String(id));
      if (!chat) continue;

      const peer = chat.type === 'direct' ? peerFor(chat) : null;
      const title = chat.type === 'direct'
        ? (peer?.display_name?.trim() || peer?.username?.trim() || chat.title?.trim() || 'Личные сообщения')
        : (chat.title?.trim() || 'Групповая беседа');
      const name = node.querySelector('.chat-item-name');
      if (name && name.textContent !== title) name.textContent = title;

      const preview = node.querySelector('.chat-item-preview');
      if (preview) {
        const recent = chat._rimLastMessagePreview || chat.last_message_preview || '';
        const fallback = chat.type === 'direct' ? (peer?.username ? `@${peer.username}` : 'Личная переписка') : 'Групповая беседа';
        const value = recent ? String(recent).replace(/\s+/g, ' ').trim().slice(0, 100) : fallback;
        if (preview.textContent !== value) preview.textContent = value;
      }

      const unread = Math.max(0, Number(chat._rimUnreadCount) || 0);
      let badge = name?.querySelector('.feature-count');
      if (unread > 0 && name) {
        if (!badge) { badge = this.document.createElement('span'); badge.className = 'feature-count'; name.append(badge); }
        badge.textContent = unread > 99 ? '99+' : String(unread);
        badge.setAttribute?.('aria-label', `${unread} непрочитанных сообщений`);
      } else badge?.remove?.();

      const avatar = node.querySelector('.avatar');
      if (avatar && chat.type === 'direct') jobs.push(this.paintAvatar(avatar, peer, title, token));
    }
    await Promise.all(jobs);
  }

  
  conversationTitle(chat) {
    if (!chat) return 'Переписка';
    const peer = [chat.other_profile, chat.peer_profile, chat.other_user]
      .find(value => value && (value.id || value.username || value.display_name)) || null;
    return displayConversationTitle(chat, peer);
  }

  /**
   * Paints the conversation list DOM. Preserves .chat-item contract;
   * uses data-conversation-id + delegated click instead of inline onclick.
   */
  paintList() {
    const list = this.document?.getElementById?.('chatList');
    if (!list) return;

    const rows = this.getConversations?.() || [];
    if (!rows.length) {
      list.innerHTML = '<div class="empty-state">Пока нет переписок.<br>Создай новый чат кнопкой ＋</div>';
      return;
    }

    const activeId = this.getActiveConversation?.()?.id;
    list.innerHTML = rows.map(chat => {
      const active = String(chat.id) === String(activeId) ? 'active' : '';
      const title = escapeHtml(this.conversationTitle(chat));
      const preview = escapeHtml(conversationSubtitle(chat) || (chat.type === 'channel' ? (chat.username ? '@' + chat.username : 'Канал') : chat.type === 'group' ? 'Групповая беседа' : 'Переписка'));
      const id = escapeHtml(chat.id);
      const glyph = chat.type === 'group' ? '♧' : chat.type === 'channel' ? '◉' : '⚜';
      const entityKind = chat._rimEntityKind === 'channel' ? 'channel' : 'conversation';
      return `<div class="chat-item ${active}" data-conversation-id="${id}" data-rim-entity-kind="${entityKind}" role="button" tabindex="0">
    <div class="avatar">${glyph}</div>
    <div class="chat-item-info">
     <div class="chat-item-name">${title}</div>
     <div class="chat-item-preview">${preview}</div>
    </div>
   </div>`;
    }).join('');

    if (!list.dataset.rimListBound) {
      list.dataset.rimListBound = '1';
      list.addEventListener('click', event => {
        const item = event.target?.closest?.('[data-conversation-id]');
        if (!item || !list.contains(item)) return;
        const id = item.getAttribute('data-conversation-id');
        if (!id) return;
        if (item.dataset.rimEntityKind === 'channel') this.window?.openChannel?.(id);
        else this.window?.openConversation?.(id);
      });
      list.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const item = event.target?.closest?.('[data-conversation-id]');
        if (!item || !list.contains(item)) return;
        event.preventDefault();
        const id = item.getAttribute('data-conversation-id');
        if (!id) return;
        if (item.dataset.rimEntityKind === 'channel') this.window?.openChannel?.(id);
        else this.window?.openConversation?.(id);
      });
    }
  }


  favoritesActivityTime() {
    try {
      const raw = this.window?.localStorage?.getItem?.('rim_favorites_last_activity');
      const value = raw ? new Date(raw).getTime() : 0;
      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  }

  touchFavoritesActivity(iso = null) {
    try {
      const value = iso || new Date().toISOString();
      this.window?.localStorage?.setItem?.('rim_favorites_last_activity', value);
    } catch { /* ignore */ }
  }

  ensureFavoritesRow() {
    const list = this.document?.getElementById?.('chatList');
    if (!list) return;
    const existing = list.querySelectorAll?.('#rimFavoritesRow, #rimFavoritesRowStable') || [];
    if (existing.length) return existing[0];

    const row = this.document.createElement('div');
    row.id = 'rimFavoritesRow';
    row.className = 'chat-item';
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    if (row.dataset) row.dataset.rimFavorites = '1';
    else try { row.setAttribute?.('data-rim-favorites', '1'); } catch { /* ignore */ }
    // Same markup shape as regular chats so CSS treats Избранное as a normal list row.
    row.innerHTML = `<div class="avatar">★</div>
    <div class="chat-item-info">
     <div class="chat-item-name">Избранное</div>
     <div class="chat-item-preview">Личные заметки и документы</div>
    </div>`;
    row.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof this.window?.openFavorites === 'function') this.window.openFavorites();
      else this.window?.RIM?.features?.favorites?.mount?.();
    });

    // Not pinned: place among chats by last favorites activity (Telegram-like ordering).
    const favTime = this.favoritesActivityTime();
    const items = [...(list.querySelectorAll?.('.chat-item[data-conversation-id]') || [])];
    let inserted = false;
    for (const item of items) {
      const chatId = item.getAttribute('data-conversation-id');
      const chat = (this.getConversations?.() || []).find(row => String(row.id) === String(chatId));
      const chatTime = chat
        ? new Date(chat._rimLastMessageAt || chat.last_message_at || chat.created_at || 0).getTime()
        : 0;
      if (favTime >= (Number.isFinite(chatTime) ? chatTime : 0)) {
        list.insertBefore(row, item);
        inserted = true;
        break;
      }
    }
    if (!inserted) list.appendChild(row);
  }

  observeFavoritesRow() {
    const list = this.document?.getElementById?.('chatList');
    if (!list) return;
    if (this.favoritesObserver && this.favoritesObservedList === list) return;
    this.favoritesObserver?.disconnect?.();
    const Observer = this.window?.MutationObserver || globalThis.MutationObserver;
    if (typeof Observer !== 'function') return;
    this.favoritesObservedList = list;
    this.favoritesObserver = new Observer(() => {
      if (this.favoritesObserverQueued) return;
      this.favoritesObserverQueued = true;
      queueMicrotask(() => {
        this.favoritesObserverQueued = false;
        if (!list.querySelector?.('#rimFavoritesRow, #rimFavoritesRowStable')) this.ensureFavoritesRow();
      });
    });
    this.favoritesObserver.observe(list, { childList: true });
  }

  dispose() {
    this.favoritesObserver?.disconnect?.();
    this.favoritesObserver = null;
    this.favoritesObservedList = null;
    this.favoritesObserverQueued = false;
  }
}
