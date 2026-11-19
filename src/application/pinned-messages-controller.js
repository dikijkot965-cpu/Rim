import { Err, Ok } from '../core/result.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[ch]);
}

/**
 * Owns the pinned-messages modal for the active conversation.
 * Loads message_pins for the current user, renders the existing modal
 * markup, and supports unpin + jump-to-message via legacy window hooks.
 */
export class PinnedMessagesController {
  constructor({
    client,
    getUser,
    getActiveConversation = () => null,
    notify = () => {},
    featureError = null,
    showModal = null,
    windowRef = globalThis.window,
    logger = null
  } = {}) {
    this.client = client;
    this.getUser = getUser;
    this.getActiveConversation = getActiveConversation;
    this.notify = notify;
    this.featureError = featureError || ((msg, err) => {
      this.notify?.(msg);
      this.logger?.warn?.('pinned.featureError', { msg, error: err?.message || err });
    });
    this.showModal = showModal || ((html) => this.window?.showModal?.(html));
    this.window = windowRef;
    this.logger = logger;
  }

  async open() {
    const conversation = this.getActiveConversation?.();
    const user = this.getUser?.();
    if (!conversation?.id) return Err(new Error('Нет активного чата.'));
    if (!user?.id) return Err(new Error('Требуется вход в РИМ.'));

    const { data, error } = await this.client
      .from('message_pins')
      .select('message_id,created_at,chat_messages(id,body,sticker_id,created_at)')
      .eq('user_id', user.id)
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: false });

    if (error) {
      this.featureError('Не удалось загрузить закреплённое', error);
      return Err(error);
    }

    const html = (data || []).map(x => {
      const body = x.chat_messages?.body || x.chat_messages?.sticker_id || 'Вложение';
      const messageId = escapeHtml(x.message_id);
      return `<div class="feature-comment"><div>${escapeHtml(body)}</div><div class="feature-actions"><button class="action-btn" type="button" onclick="jumpToMessage('${messageId}')">Перейти</button><button class="action-btn danger-btn" type="button" onclick="unpinMessage('${messageId}');openPinnedMessages()">Убрать</button></div></div>`;
    }).join('');

    this.showModal(
      `<h2 class="modal-title">📌 Закреплённые сообщения</h2>${html || '<div class="empty-state">Нет закреплённых сообщений.</div>'}<button class="primary-btn" style="width:100%" type="button" onclick="closeModal()">Закрыть</button>`
    );

    this.logger?.info?.('pinnedMessages.opened', {
      conversationId: conversation.id,
      count: (data || []).length
    });
    return Ok({ conversationId: conversation.id, count: (data || []).length });
  }
}
