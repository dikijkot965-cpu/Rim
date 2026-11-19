import { Ok, Err } from '../core/result.js';

/**
 * Modular conversation open path: resolve → commit → shell → messages → subscribe.
 * Replaces the legacy openConversation body when bound as the coordinator opener.
 */
export class ConversationOpenService {
  constructor({
    getUser,
    getConversations,
    setConversations,
    resolveConversation,
    beginNavigation,
    isNavigationCurrent,
    commitSelection,
    shell,
    loadMessages,
    subscribeMessages,
    markRead,
    cancelReply,
    notify,
    trackOpen,
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    logger = null
  } = {}) {
    this.getUser = getUser;
    this.getConversations = getConversations || (() => []);
    this.setConversations = setConversations || (() => {});
    this.resolveConversation = resolveConversation;
    this.beginNavigation = beginNavigation;
    this.isNavigationCurrent = isNavigationCurrent;
    this.commitSelection = commitSelection;
    this.shell = shell;
    this.loadMessages = loadMessages;
    this.subscribeMessages = subscribeMessages;
    this.markRead = markRead;
    this.cancelReply = cancelReply;
    this.notify = notify || (() => {});
    this.trackOpen = trackOpen || (async () => {});
    this.document = documentRef;
    this.window = windowRef;
    this.logger = logger;
  }

  async open(id) {
    const user = this.getUser?.();
    const host = this.document?.getElementById?.('chatWindow');
    if (!id || !user || !host) {
      this.notify('Не удалось открыть чат: отсутствует идентификатор переписки или сессия.');
      return Err(new Error('open.preconditions'));
    }

    const token = this.beginNavigation?.(id) || null;

    try {
      let list = this.getConversations?.() || [];
      let chat = list.find(c => String(c.id) === String(id));

      if (!chat && this.resolveConversation) {
        const resolved = await this.resolveConversation(id, user.id);
        chat = resolved;
        if (chat) {
          const next = [chat, ...list.filter(c => String(c.id) !== String(chat.id))];
          this.setConversations?.(next);
        }
      }

      if (!chat) {
        throw new Error('Переписка не найдена или у аккаунта нет доступа.');
      }

      if (token && this.isNavigationCurrent && !this.isNavigationCurrent(token)) {
        return Ok({ cancelled: true, stale: true });
      }

      try { this.cancelReply?.(); } catch { /* ignore */ }

      if (token) {
        const committed = this.commitSelection?.(token, chat);
        if (committed === false) return Ok({ cancelled: true, stale: true });
      }

      this.shell?.paintProvisionalHeader?.(chat);
      this.shell?.openMobileShell?.();

      try {
        const renderList = this.window?.renderConversationList || globalThis.renderConversationList;
        if (typeof renderList === 'function') renderList();
      } catch { /* list paint optional mid-open */ }

      if (typeof this.loadMessages === 'function') {
        await this.loadMessages();
      }
      if (token && this.isNavigationCurrent && !this.isNavigationCurrent(token)) {
        return Ok({ cancelled: true, stale: true });
      }

      try { this.subscribeMessages?.(); } catch { /* ignore */ }
      try { await this.markRead?.(); } catch { /* ignore */ }

      if (typeof this.shell?.applyAfterSelection === 'function') {
        this.shell.applyAfterSelection(chat, {
          isCurrent: () => !token || !this.isNavigationCurrent || this.isNavigationCurrent(token)
        });
      } else {
        this.shell?.ensureGroupSettingsButton?.(chat);
        this.shell?.ensurePinnedShortcut?.(chat);
        if (chat.type === 'group' && chat.avatar_path) {
          try { await this.shell?.applyGroupAvatar?.(chat); } catch { /* optional */ }
        }
      }

      try {
        await this.trackOpen?.({ conversation_id: id, type: chat.type });
      } catch { /* analytics optional */ }

      return Ok({ conversation: chat });
    } catch (error) {
      this.logger?.error?.('chat.open.modular.failed', error, { conversationId: id });
      this.notify(`Не удалось открыть чат: ${error?.message || error}`);
      return Err(error);
    }
  }
}
