/**
 * Pure outbox / offline-queue rules for message sends.
 * Persistence and network live outside this module.
 */

export const OUTBOX_STATUSES = Object.freeze([
  'pending',
  'sending',
  'sent',
  'failed'
]);

/**
 * @param {object} input
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
export function createOutboxItem(input = {}) {
  const conversationId = String(input.conversationId || '').trim();
  const body = String(input.body || '').trim();
  const userId = String(input.userId || '').trim();
  if (!userId) return { ok: false, error: 'Не удалось определить владельца очереди сообщений.' };
  if (!conversationId) return { ok: false, error: 'Нет conversationId для outbox.' };
  if (!body) return { ok: false, error: 'Пустое тело нельзя ставить в очередь.' };
  const generatedId = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  const id = String(input.id || `obx_${generatedId}`);
  return {
    ok: true,
    value: Object.freeze({
      id,
      userId,
      conversationId,
      conversationType: String(input.conversationType || '').trim(),
      conversationIsPrivate: typeof input.conversationIsPrivate === 'boolean' ? input.conversationIsPrivate : null,
      body,
      replyToMessageId: input.replyToMessageId ? String(input.replyToMessageId) : null,
      topicId: input.topicId ? String(input.topicId) : null,
      clientCreatedAt: Number(input.clientCreatedAt) || Date.now(),
      status: 'pending',
      attempts: 0,
      lastError: null
    })
  };
}

export function markOutboxSending(item) {
  if (!item?.id) return { ok: false, error: 'Нет элемента outbox.' };
  if (item.status === 'sent') return { ok: false, error: 'Уже отправлено.' };
  return {
    ok: true,
    value: Object.freeze({
      ...item,
      status: 'sending',
      attempts: Number(item.attempts || 0) + 1
    })
  };
}

export function markOutboxSent(item) {
  if (!item?.id) return { ok: false, error: 'Нет элемента outbox.' };
  return {
    ok: true,
    value: Object.freeze({
      ...item,
      status: 'sent',
      lastError: null,
      sentAt: Date.now()
    })
  };
}

export function markOutboxFailed(item, errorMessage) {
  if (!item?.id) return { ok: false, error: 'Нет элемента outbox.' };
  return {
    ok: true,
    value: Object.freeze({
      ...item,
      status: 'failed',
      lastError: String(errorMessage || 'Ошибка отправки'),
      nextAttemptAt: Date.now() + Math.min(15 * 60 * 1000, 1000 * (2 ** Math.min(Number(item.attempts || 1), 10)))
    })
  };
}

export function listRetryable(items, now = Date.now()) {
  return (items || []).filter(i => i && (i.status === 'pending' || (i.status === 'failed' && Number(i.nextAttemptAt || 0) <= now)));
}

export function isNetworkLikeError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  if (!msg) return false;
  return /network|fetch|offline|failed to fetch|timeout|econn|socket|temporar|503|502|504/.test(msg);
}
