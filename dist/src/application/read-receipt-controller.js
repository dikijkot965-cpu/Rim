/**
 * Owns outgoing read-receipt ticks and the active conversation read-state subscription.
 * DOM classes and visual styling remain compatible with the existing messenger UI.
 */
export function latestPeerReadTimestamp(rows) {
  return (rows || []).reduce((latest, row) => {
    if (!row?.last_read_at) return latest;
    const value = new Date(row.last_read_at).getTime();
    return Number.isFinite(value) && (latest === null || value > latest) ? value : latest;
  }, null);
}

export function isOwnMessage(message, userId) {
  return userId != null && String(message?.sender_id) === String(userId);
}

export function isMessageRead(message, peerReadAt, enabled = true) {
  if (!enabled || peerReadAt === null || peerReadAt === undefined) return false;
  const timestamp = new Date(message?.created_at || 0).getTime();
  return Number.isFinite(timestamp) && peerReadAt >= timestamp;
}

export class ReadReceiptController {
  constructor({ client, getUser, getActiveConversation, getMessages, getPreferences, logger }) {
    this.client = client;
    this.getUser = getUser;
    this.getActiveConversation = getActiveConversation;
    this.getMessages = getMessages;
    this.getPreferences = getPreferences || (() => ({}));
    this.logger = logger;
    this.channel = null;
    this.conversationId = null;
    this.bindSequence = 0;
    this.lastPeerReadAt = null;
    this.disposed = false;
    if (typeof document !== 'undefined' && !document.getElementById('rim-read-receipt-style')) {
      const style = document.createElement('style');
      style.id = 'rim-read-receipt-style';
      style.textContent = '.rim-send-check{display:inline-block;margin-left:5px;color:var(--gold,#c9a45d);font-size:12px;font-weight:800;letter-spacing:-2px}';
      document.head?.append(style);
    }
  }

  isReadReceiptsEnabled() {
    try { return this.getPreferences?.()?.showRead !== false; }
    catch { return true; }
  }

  async getPeerReadAt(conversationId) {
    const user = this.getUser?.();
    if (!user?.id || !conversationId) return null;
    const { data, error } = await this.client.from('conversation_read_state')
      .select('last_read_at')
      .eq('conversation_id', conversationId)
      .neq('user_id', user.id);
    if (error) throw error;
    return latestPeerReadTimestamp(data);
  }

  applyTicks(peerReadAt = this.lastPeerReadAt) {
    const user = this.getUser?.();
    if (!user?.id) return;
    const enabled = this.isReadReceiptsEnabled();
    try {
      this.window?.__rimMessageListRenderer?.setDeliveryContext?.({
        peerReadAt: peerReadAt ?? this.lastPeerReadAt,
        receiptsEnabled: enabled
      });
    } catch { /* optional */ }
    const messages = this.getMessages?.() || [];
    for (const message of messages) {
      if (!isOwnMessage(message, user.id)) continue;
      const element = document.querySelector(`.message[data-id="${CSS.escape(String(message.id))}"]`);
      const meta = element?.querySelector('.message-meta');
      if (!meta) continue;
      let tick = meta.querySelector('.rim-send-check');
      if (!tick) {
        tick = document.createElement('span');
        tick.className = 'rim-send-check';
        tick.textContent = '✓';
        tick.title = 'Отправлено';
        meta.append(tick);
      }
      const read = isMessageRead(message, peerReadAt, enabled);
      tick.textContent = read ? '✓✓' : '✓';
      tick.title = read ? 'Прочитано' : 'Отправлено';
      tick.setAttribute('aria-label', tick.title);
      // Remove the former duplicate tick emitted by the retired renderer wrapper.
      meta.querySelector('.rim-read-check')?.remove();
    }
  }

  async render() {
    this.applyTicks(null);
    const conversation = this.getActiveConversation?.();
    if (!conversation?.id || !this.isReadReceiptsEnabled()) return;
    try {
      const peerReadAt = await this.getPeerReadAt(conversation.id);
      if (String(this.getActiveConversation?.()?.id) !== String(conversation.id)) return;
      this.lastPeerReadAt = peerReadAt;
      this.applyTicks(peerReadAt);
    } catch (error) {
      this.logger?.warn?.('chat.read_receipts.refresh.failed', { message: error?.message, conversationId: conversation.id });
    }
  }

  async bind(conversationId) {
    const id = conversationId == null ? null : String(conversationId);
    if (id === this.conversationId && this.channel) {
      await this.render();
      return;
    }
    await this.unbind();
    if (!id || this.disposed || !this.isReadReceiptsEnabled()) return;
    const sequence = ++this.bindSequence;
    this.conversationId = id;
    try {
      this.channel = this.client.channel(`rim-read-receipts-${id}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'conversation_read_state',
          filter: `conversation_id=eq.${id}`
        }, async () => {
          if (sequence !== this.bindSequence || this.conversationId !== id) return;
          await this.render();
        })
        .subscribe();
      await this.render();
    } catch (error) {
      this.logger?.warn?.('chat.read_receipts.subscribe.failed', { message: error?.message, conversationId: id });
    }
  }

  async unbind() {
    ++this.bindSequence;
    const channel = this.channel;
    this.channel = null;
    this.conversationId = null;
    this.lastPeerReadAt = null;
    if (channel) {
      try { await this.client.removeChannel(channel); }
      catch (error) { this.logger?.warn?.('chat.read_receipts.unsubscribe.failed', { message: error?.message }); }
    }
  }

  async dispose() {
    this.disposed = true;
    await this.unbind();
  }
}
