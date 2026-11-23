import { Err, Ok } from '../core/result.js';
import {
  createOutboxItem,
  markOutboxSending,
  markOutboxSent,
  markOutboxFailed,
  listRetryable,
  isNetworkLikeError
} from '../domain/outbox.js';

const STORAGE_PREFIX = 'rim.outbox.v2.';

/**
 * Local outbox for text messages when the network fails or the device is offline.
 * Flush is idempotent per item id; successful items are dropped from storage.
 */
export class MessageOutboxService {
  constructor({
    storage = globalThis.localStorage,
    sendText = null,
    notify = () => {},
    logger = null,
    windowRef = globalThis.window,
    getUserId = () => null
  } = {}) {
    this.storage = storage;
    this.sendText = sendText;
    this.notify = notify;
    this.logger = logger;
    this.window = windowRef;
    this.getUserId = getUserId;
    this.flushing = false;
    this._onOnline = () => { void this.flush(); };
  }

  #ownerId() {
    const value = this.getUserId?.();
    return value == null ? '' : String(value).trim();
  }

  #storageKey(ownerId = this.#ownerId()) {
    return ownerId ? `${STORAGE_PREFIX}${encodeURIComponent(ownerId)}` : null;
  }

  #read(ownerId = this.#ownerId()) {
    const key = this.#storageKey(ownerId);
    if (!key) return [];
    try {
      const raw = this.storage?.getItem?.(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('Некорректный формат очереди сообщений.');
      // A tab may have closed while an item was in flight. Requeue it safely;
      // the server-side client_message_id makes retries idempotent.
      return parsed
        .filter(item => item && item.userId === ownerId && item.id && item.conversationId && item.body)
        .map(item => item.status === 'sending' ? { ...item, status: 'pending' } : item);
    } catch (error) {
      this.logger?.warn?.('outbox.read.failed', { ownerId, message: error?.message || String(error) });
      return [];
    }
  }

  #write(items, ownerId = this.#ownerId()) {
    const key = this.#storageKey(ownerId);
    if (!key) return false;
    try {
      const live = (items || []).filter(item => item && item.userId === ownerId && item.status !== 'sent');
      if (!this.storage?.setItem) throw new Error('Локальное хранилище недоступно.');
      this.storage.setItem(key, JSON.stringify(live));
      return true;
    } catch (error) {
      this.logger?.warn?.('outbox.persist.failed', { ownerId, message: error?.message || String(error) });
      return false;
    }
  }

  list() {
    return this.#read();
  }

  listForConversation(conversationId) {
    const id = String(conversationId || '');
    return this.#read().filter(i => i && String(i.conversationId) === id && i.status !== 'sent');
  }

  toLocalMessages(conversationId, userId) {
    return this.listForConversation(conversationId).map(item => ({
      id: `outbox:${item.id}`,
      conversation_id: item.conversationId,
      sender_id: userId,
      body: item.body,
      created_at: new Date(item.clientCreatedAt || Date.now()).toISOString(),
      clientCreatedAt: item.clientCreatedAt,
      _rimOutboxPending: true,
      _rimOutboxId: item.id,
      _rimOutboxStatus: item.status
    }));
  }

  enqueueText({ userId = this.#ownerId(), conversationId, conversationType = '', conversationIsPrivate = null, body, replyToMessageId = null, topicId = null }) {
    if (!userId || String(userId) !== this.#ownerId()) return Err(new Error('Очередь доступна только текущему аккаунту.'));
    const created = createOutboxItem({
      userId,
      conversationId,
      conversationType,
      conversationIsPrivate,
      body,
      replyToMessageId,
      topicId
    });
    if (!created.ok) return Err(new Error(created.error));
    const items = this.#read();
    items.push(created.value);
    if (!this.#write(items, String(userId))) return Err(new Error('Не удалось сохранить сообщение на устройстве. Освободите место и повторите отправку.'));
    this.logger?.info?.('outbox.enqueued', { id: created.value.id, conversationId });
    return Ok(created.value);
  }

  async flush() {
    if (this.flushing) return Ok({ skipped: true });
    if (!this.sendText) return Err(new Error('sendText не привязан к outbox.'));
    const ownerId = this.#ownerId();
    if (!ownerId) return Err(new Error('Для отправки очереди необходимо войти в аккаунт.'));
    if (this.window?.navigator && this.window.navigator.onLine === false) {
      return Ok({ offline: true });
    }
    this.flushing = true;
    try {
      let items = this.#read(ownerId);
      const retryable = listRetryable(items);
      let sent = 0;
      for (const item of retryable) {
        if (this.#ownerId() !== ownerId) break;
        const sending = markOutboxSending(item);
        if (!sending.ok) continue;
        items = items.map(i => (i.id === item.id ? sending.value : i));
        if (!this.#write(items, ownerId)) return Err(new Error('Не удалось обновить локальную очередь. Отправка остановлена.'));
        try {
          const result = await this.sendText(item.body, {
            conversationId: item.conversationId,
            conversationType: item.conversationType,
            conversationIsPrivate: item.conversationIsPrivate,
            replyToMessageId: item.replyToMessageId,
            topicId: item.topicId,
            fromOutbox: true,
            outboxId: item.id,
            skipPolicy: true,
            expectedUserId: ownerId
          });
          if (result && result.ok === false) {
            throw result.error || new Error('Не удалось отправить из outbox.');
          }
          markOutboxSent(sending.value);
          items = items.filter(i => i.id !== item.id);
          if (!this.#write(items, ownerId)) return Err(new Error('Сообщение отправлено, но локальную очередь не удалось обновить.'));
          sent += 1;
          this.logger?.info?.('outbox.sent', { id: item.id });
        } catch (error) {
          const failed = markOutboxFailed(sending.value, error?.message || error);
          items = items.map(i => (i.id === item.id ? failed.value : i));
          this.#write(items, ownerId);
          this.logger?.warn?.('outbox.item.failed', { id: item.id, message: error?.message });
          if (!isNetworkLikeError(error)) {
            // permanent-ish failure: keep failed for manual retry, continue others
            continue;
          }
          // network: stop flush to avoid tight loop
          break;
        }
      }
      return Ok({ sent, remaining: listRetryable(this.#read(ownerId)).length });
    } finally {
      this.flushing = false;
    }
  }

  bindOnlineListener() {
    try {
      this.window?.addEventListener?.('online', this._onOnline);
    } catch { /* ignore */ }
  }

  bindAuthListener(auth) {
    if (!auth?.onAuthStateChange) return;
    const { data } = auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user?.id) {
        queueMicrotask(() => { void this.flush(); });
      }
    });
    this.authSubscription = data?.subscription || null;
    if (this.#ownerId()) queueMicrotask(() => { void this.flush(); });
  }

  dispose() {
    try { this.authSubscription?.unsubscribe?.(); } catch { /* best effort */ }
    try {
      this.window?.removeEventListener?.('online', this._onOnline);
    } catch { /* ignore */ }
  }
}

export { isNetworkLikeError };
