/**
 * Pure delivery-status rules for chat messages.
 */

export const DELIVERY = Object.freeze({
  QUEUED: 'queued',
  SENDING: 'sending',
  SENT: 'sent',
  READ: 'read',
  FAILED: 'failed'
});

/**
 * Resolve client-visible delivery state for an own message.
 * @param {object} message
 * @param {{ peerReadAt?: number|null, receiptsEnabled?: boolean }} [ctx]
 * @returns {{ status: string, label: string, ticks: string }}
 */
export function resolveDeliveryStatus(message, ctx = {}) {
  if (message?._rimOutboxPending || message?._rimOutboxStatus === 'pending') {
    return { status: DELIVERY.QUEUED, label: 'В очереди', ticks: '⏳' };
  }
  if (message?._rimOutboxStatus === 'sending') {
    return { status: DELIVERY.SENDING, label: 'Отправляется', ticks: '…' };
  }
  if (message?._rimOutboxStatus === 'failed' || message?._rimSendFailed) {
    return { status: DELIVERY.FAILED, label: 'Не доставлено', ticks: '!' };
  }

  const receiptsEnabled = ctx.receiptsEnabled !== false;
  const peerReadAt = ctx.peerReadAt;
  if (receiptsEnabled && peerReadAt != null) {
    const ts = new Date(message?.created_at || 0).getTime();
    if (Number.isFinite(ts) && peerReadAt >= ts) {
      return { status: DELIVERY.READ, label: 'Прочитано', ticks: '✓✓' };
    }
  }

  if (message?.id && !String(message.id).startsWith('outbox:')) {
    return { status: DELIVERY.SENT, label: 'Отправлено', ticks: '✓' };
  }

  return { status: DELIVERY.SENT, label: 'Отправлено', ticks: '✓' };
}

export function shouldShowDeliveryTicks(message, currentUserId) {
  if (!message) return false;
  if (message._rimOutboxPending) return true;
  return currentUserId != null && String(message.sender_id) === String(currentUserId);
}
