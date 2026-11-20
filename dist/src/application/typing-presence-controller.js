/**
 * Owns conversation-scoped typing broadcast and peer presence status text.
 * Prevents stale channel handlers from writing into a newer active chat.
 * Read-receipt tick painting remains with ReadReceiptController / legacy helpers.
 */
export class TypingPresenceController {
  constructor({
    client,
    getUser,
    getActiveConversation,
    setStatus = null,
    documentRef = globalThis.document,
    logger = null,
    typingIdleMs = 1700,
    peerTypingHoldMs = 2600,
    sendThrottleMs = 700
  } = {}) {
    this.client = client;
    this.getUser = getUser;
    this.getActiveConversation = getActiveConversation;
    this.setStatus = setStatus || ((text) => {
      const node = documentRef?.getElementById?.('chatHeadStatus');
      if (node) node.textContent = String(text ?? '');
    });
    this.document = documentRef;
    this.logger = logger;
    this.typingIdleMs = typingIdleMs;
    this.peerTypingHoldMs = peerTypingHoldMs;
    this.sendThrottleMs = sendThrottleMs;

    this.bindSequence = 0;
    this.activeConversationId = null;
    this.typingChannel = null;
    this.localTypingTimer = null;
    this.peerTypingTimer = null;
    this.typingSentAt = 0;
    this.inputBound = false;
    this.disposed = false;
    this.inputHandler = null;
    this.blurHandler = null;
  }

  #conversationMatches(conversationId) {
    return String(this.activeConversationId || '') === String(conversationId || '');
  }

  async unbind() {
    this.bindSequence += 1;
    this.activeConversationId = null;
    if (this.localTypingTimer) {
      clearTimeout(this.localTypingTimer);
      this.localTypingTimer = null;
    }
    if (this.peerTypingTimer) {
      clearTimeout(this.peerTypingTimer);
      this.peerTypingTimer = null;
    }
    const channel = this.typingChannel;
    this.typingChannel = null;
    if (channel && this.client?.removeChannel) {
      try { await this.client.removeChannel(channel); }
      catch (error) { this.logger?.warn?.('typing.channel.remove.failed', { message: error?.message }); }
    }
  }

  async bind(conversation) {
    if (this.disposed) return false;
    const user = this.getUser?.();
    if (!this.client || !user?.id || !conversation?.id) return false;

    const conversationId = String(conversation.id);
    if (this.#conversationMatches(conversationId) && this.typingChannel) return true;

    const sequence = ++this.bindSequence;
    await this.#replaceChannel(null); // clear previous before switch
    if (sequence !== this.bindSequence) return false;

    this.activeConversationId = conversationId;

    // Presence status for direct chats; groups keep whatever header already shows.
    if (conversation.type === 'direct') {
      await this.refreshPeerPresence(conversation, sequence);
      if (sequence !== this.bindSequence || !this.#conversationMatches(conversationId)) return false;
    }

    const channel = this.client.channel(`rim-typing-${conversationId}`, {
      config: { broadcast: { self: false } }
    });

    channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (sequence !== this.bindSequence || !this.#conversationMatches(conversationId)) return;
      if (!payload || String(payload.user_id) === String(user.id)) return;
      if (payload.is_typing) {
        this.setStatus('Печатает…');
        if (this.peerTypingTimer) clearTimeout(this.peerTypingTimer);
        this.peerTypingTimer = setTimeout(() => {
          if (sequence === this.bindSequence && this.#conversationMatches(conversationId)) {
            void this.refreshPeerPresence(conversation, sequence);
          }
        }, this.peerTypingHoldMs);
      } else {
        void this.refreshPeerPresence(conversation, sequence);
      }
    });

    channel.subscribe((status) => {
      if (sequence !== this.bindSequence) return;
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        this.logger?.warn?.('typing.channel.status', { status, conversationId });
      }
    });

    if (sequence !== this.bindSequence || !this.#conversationMatches(conversationId)) {
      try { await this.client.removeChannel(channel); } catch { /* ignore */ }
      return false;
    }

    this.typingChannel = channel;
    return true;
  }

  async #replaceChannel(nextChannel) {
    const previous = this.typingChannel;
    this.typingChannel = nextChannel;
    if (previous && this.client?.removeChannel) {
      try { await this.client.removeChannel(previous); }
      catch (error) { this.logger?.warn?.('typing.channel.replace.failed', { message: error?.message }); }
    }
  }

  async refreshPeerPresence(conversation, sequence = this.bindSequence) {
    const user = this.getUser?.();
    if (!conversation?.id || conversation.type !== 'direct' || !user?.id) return;

    try {
      const members = await this.client
        .from('conversation_members')
        .select('user_id')
        .eq('conversation_id', conversation.id);
      if (members.error) throw members.error;
      if (sequence !== this.bindSequence || !this.#conversationMatches(conversation.id)) return;

      const peer = (members.data || []).find(row => String(row.user_id) !== String(user.id));
      if (!peer) return;

      const profile = await this.client
        .from('profiles')
        .select('last_seen_at,show_online,display_name,username')
        .eq('id', peer.user_id)
        .maybeSingle();
      if (profile.error) throw profile.error;
      if (sequence !== this.bindSequence || !this.#conversationMatches(conversation.id)) return;

      const row = profile.data;
      const stamp = row?.last_seen_at;
      const visible = row?.show_online !== false;
      if (!visible) {
        this.setStatus('Статус скрыт');
        return;
      }
      if (stamp) {
        const text = 'Был(а) в сети ' + new Date(stamp).toLocaleString('ru-RU', {
          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
        });
        this.setStatus(text);
      } else {
        this.setStatus('Давно не заходил(а)');
      }
    } catch (error) {
      this.logger?.warn?.('typing.peer.presence.failed', { message: error?.message });
    }
  }

  sendTyping(isTyping) {
    if (!this.typingChannel || this.disposed) return;
    const user = this.getUser?.();
    if (!user?.id) return;
    const now = Date.now();
    if (isTyping && now - this.typingSentAt < this.sendThrottleMs) return;
    this.typingSentAt = now;
    this.typingChannel
      .send({
        type: 'broadcast',
        event: 'typing',
        payload: { user_id: user.id, is_typing: !!isTyping }
      })
      .catch(() => {});
  }

  bindInput() {
    if (this.inputBound || this.disposed) return;
    const input = this.document?.getElementById?.('messageInput');
    if (!input) return;

    this.inputBound = true;
    this.inputHandler = () => {
      const on = !!input.value.trim();
      this.sendTyping(on);
      if (this.localTypingTimer) clearTimeout(this.localTypingTimer);
      if (on) {
        this.localTypingTimer = setTimeout(() => this.sendTyping(false), this.typingIdleMs);
      }
    };
    this.blurHandler = () => this.sendTyping(false);
    input.addEventListener('input', this.inputHandler);
    input.addEventListener('blur', this.blurHandler);
  }

  async dispose() {
    this.disposed = true;
    const input = this.document?.getElementById?.('messageInput');
    if (input && this.inputHandler) input.removeEventListener('input', this.inputHandler);
    if (input && this.blurHandler) input.removeEventListener('blur', this.blurHandler);
    this.inputBound = false;
    await this.unbind();
  }
}
