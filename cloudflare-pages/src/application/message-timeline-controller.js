import { messageCursor, mergeMessageEvent } from '../infrastructure/supabase/message-repository.js';

export class MessageTimelineController {
  constructor({ repository, getConversation, getMessages, setMessages, render, logger, pageSize = 50, documentRef = globalThis.document }) {
    this.repository = repository;
    this.getConversation = getConversation;
    this.getMessages = getMessages;
    this.setMessages = setMessages;
    this.render = render;
    this.logger = logger;
    this.pageSize = Math.max(1, Math.min(200, Math.trunc(Number(pageSize)) || 50));
    this.documentRef = documentRef;
    this.channel = null;
    this.channelId = null;
    this.subscribeRequestSequence = 0;
    this.generation = 0;
    this.subscriptionEpoch = 0;
    this.hasOlder = false;
    this.loadingOlderConversationIds = new Set();
    this.realtimeSequence = 0;
    this.realtimeJournal = [];
  }

  get loadingOlder() {
    const activeId = this.getConversation()?.id;
    return activeId != null && this.loadingOlderConversationIds.has(String(activeId));
  }

  async loadLatest() {
    const conversation = this.getConversation();
    if (!conversation?.id) return;
    const generation = ++this.generation;
    // A history request for the previous chat may still be in flight. It must not
    // lock pagination for the newly selected conversation.
    this.hasOlder = false;
    const sequenceAtStart = this.realtimeSequence;
    const result = await this.repository.getLatest(conversation.id, { limit: this.pageSize });
    if (!result.ok) throw result.error;
    if (generation !== this.generation || String(this.getConversation()?.id) !== String(conversation.id)) return;
    const rows = this.applyJournal(result.value, sequenceAtStart);
    this.setMessages(rows);
    this.hasOlder = result.value.length === this.pageSize;
    await this.render();
    return rows;
  }

  async loadOlder() {
    const conversation = this.getConversation();
    const conversationId = conversation?.id == null ? null : String(conversation.id);
    const rows = this.getMessages() || [];
    const cursor = messageCursor(rows[0]);
    if (!conversationId || !cursor || !this.hasOlder || this.loadingOlderConversationIds.has(conversationId)) return [];

    this.loadingOlderConversationIds.add(conversationId);
    const generation = this.generation;
    const box = this.documentRef?.getElementById?.('messages');
    const oldHeight = box?.scrollHeight || 0;
    const oldTop = box?.scrollTop || 0;
    try {
      const result = await this.repository.getBefore(conversationId, cursor, { limit: this.pageSize });
      if (!result.ok) throw result.error;
      if (generation !== this.generation || String(this.getConversation()?.id) !== conversationId) return [];
      // Re-read after the await: Realtime may have changed the timeline while the older page was loading.
      const currentRows = this.getMessages() || rows;
      const existing = new Set(currentRows.map(row => String(row.id)));
      const older = result.value.filter(row => !existing.has(String(row.id)));
      this.setMessages([...older, ...currentRows]);
      this.hasOlder = result.value.length === this.pageSize;
      await this.render();
      if (box && String(this.getConversation()?.id) === conversationId) box.scrollTop = box.scrollHeight - oldHeight + oldTop;
      return older;
    } finally {
      this.loadingOlderConversationIds.delete(conversationId);
    }
  }

  applyJournal(rows, afterSequence) {
    let next = rows;
    for (const entry of this.realtimeJournal) {
      if (entry.sequence > afterSequence) next = mergeMessageEvent(next, entry.payload);
    }
    return next;
  }

  async applyRealtime(payload) {
    const conversation = this.getConversation();
    if (!conversation?.id) return;
    const record = payload?.eventType === 'DELETE' ? payload?.old : payload?.new;
    if (record?.conversation_id && String(record.conversation_id) !== String(conversation.id)) return;
    this.realtimeSequence++;
    this.realtimeJournal.push({ sequence: this.realtimeSequence, payload });
    if (this.realtimeJournal.length > 300) this.realtimeJournal.splice(0, this.realtimeJournal.length - 300);
    const rows = this.getMessages() || [];
    const next = mergeMessageEvent(rows, payload);
    if (next !== rows) {
      this.setMessages(next);
      await this.render();
    }
  }

  async subscribe() {
    const conversation = this.getConversation();
    if (!conversation?.id || this.channelId === String(conversation.id)) return;
    const conversationId = String(conversation.id);
    const request = ++this.subscribeRequestSequence;
    await this.detachSubscription();
    // A newer navigation may have requested another subscription while the old
    // channel was being removed. Never attach a channel for a stale selection.
    if (request !== this.subscribeRequestSequence || String(this.getConversation()?.id) !== conversationId) return;
    this.channelId = conversationId;
    const subscriptionGeneration = this.subscriptionEpoch;
    this.channel = this.repository.client.channel(`rim-message-timeline-${conversation.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversation.id}` }, payload => {
        if (subscriptionGeneration !== this.subscriptionEpoch || this.channelId !== String(conversation.id)) return;
        this.applyRealtime(payload).catch(error => this.logger?.warn?.('messages.realtime.apply.failed', { message: error?.message }));
      })
      .subscribe(status => {
        if (subscriptionGeneration !== this.subscriptionEpoch || this.channelId !== String(conversation.id)) return;
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') this.logger?.warn?.('messages.realtime.status', { status, conversationId: conversation.id });
        if (status === 'SUBSCRIBED') this.catchUp(conversation.id).catch(error => this.logger?.warn?.('messages.realtime.catchup.failed', { message: error?.message }));
      });
  }

  async catchUp(conversationId) {
    if (String(this.getConversation()?.id) !== String(conversationId)) return;
    const sequenceAtStart = this.realtimeSequence;
    const result = await this.repository.getLatest(conversationId, { limit: this.pageSize });
    if (!result.ok) throw result.error;
    if (String(this.getConversation()?.id) !== String(conversationId)) return;
    const current = this.getMessages() || [];
    const byId = new Map(current.map(row => [String(row.id), row]));
    for (const row of result.value) byId.set(String(row.id), { ...byId.get(String(row.id)), ...row });
    const merged = [...byId.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || String(a.id).localeCompare(String(b.id)));
    this.setMessages(this.applyJournal(merged, sequenceAtStart));
    await this.render();
  }

  async detachSubscription() {
    this.subscriptionEpoch++;
    const channel = this.channel;
    this.channel = null;
    this.channelId = null;
    if (channel) {
      try { await this.repository.client.removeChannel(channel); }
      catch (error) { this.logger?.warn?.('messages.realtime.dispose.failed', { message: error?.message }); }
    }
  }

  async unsubscribe() {
    this.generation++;
    this.subscribeRequestSequence++;
    await this.detachSubscription();
  }
}
