import { messageCursor, mergeMessageEvent } from '../infrastructure/supabase/message-repository.js';
import { mergeRimE2ETimelineMessages } from '../security/e2e/e2e-timeline-adapter.js';

export class MessageTimelineController {
  constructor({ repository, getConversation, getMessages, setMessages, render, logger, pageSize = 50, documentRef = globalThis.document, loadLocalMessages = null, getUser = null }) {
    this.repository = repository;
    this.getConversation = getConversation;
    this.getMessages = getMessages;
    this.setMessages = setMessages;
    this.render = render;
    this.logger = logger;
    this.pageSize = Math.max(1, Math.min(200, Math.trunc(Number(pageSize)) || 50));
    this.documentRef = documentRef;
    this.loadLocalMessages = loadLocalMessages;
    this.getUser = getUser;
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
    const rows = await this.mergeLocalRows(this.applyJournal(result.value, sequenceAtStart), conversation);
    if (generation !== this.generation || String(this.getConversation()?.id) !== String(conversation.id)) return;
    this.setMessages(rows);
    this.hasOlder = result.value.length === this.pageSize;
    await this.render();
    return rows;
  }

  async loadAround(target) {
    const conversation = this.getConversation();
    if (!conversation?.id || !target?.id) return [];
    const generation = ++this.generation;
    this.hasOlder = false;
    const result = await this.repository.getAround(conversation.id, target, { limit: Math.max(10, Math.floor(this.pageSize / 2)) });
    if (!result.ok) throw result.error;
    if (generation !== this.generation || String(this.getConversation()?.id) !== String(conversation.id)) return [];
    const rows = await this.mergeLocalRows(result.value.rows || [], conversation);
    if (generation !== this.generation || String(this.getConversation()?.id) !== String(conversation.id)) return [];
    this.setMessages(rows);
    this.hasOlder = result.value.hasOlder === true;
    await this.render();
    return rows;
  }

  async loadOlder() {
    const conversation = this.getConversation();
    const conversationId = conversation?.id == null ? null : String(conversation.id);
    const rows = this.getMessages() || [];
    // Local E2E IDs are not Supabase chat_messages cursors. Paginate using
    // the oldest server-backed row only.
    const cursor = messageCursor(rows.find(row => !row?._rimLocalOnly));
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
      const merged = await this.mergeLocalRows([...older, ...currentRows], conversation);
      this.setMessages(merged);
      this.hasOlder = result.value.length === this.pageSize;
      await this.render();
      if (box && String(this.getConversation()?.id) === conversationId) box.scrollTop = box.scrollHeight - oldHeight + oldTop;
      return older;
    } finally {
      this.loadingOlderConversationIds.delete(conversationId);
    }
  }

  async mergeLocalRows(serverRows, conversation = this.getConversation()) {
    const e2eDirect = conversation?.type === 'direct' && (conversation?.is_secret === true || conversation?.e2e_mode === 'required');
    const e2ePrivateGroup = conversation?.type === 'group' && conversation?.is_private === true && conversation?.e2e_mode === 'required';
    if (!(e2eDirect || e2ePrivateGroup) || typeof this.loadLocalMessages !== 'function') return serverRows;
    try {
      const localRows = await this.loadLocalMessages(conversation);
      return mergeRimE2ETimelineMessages(serverRows, localRows || [], this.getUser?.()?.id || '');
    } catch (error) {
      // A local E2E database failure must not prevent legacy/server history
      // from rendering. It is logged distinctly and never falls back to plaintext.
      this.logger?.warn?.('e2e.timeline.local_history.unavailable', { conversationId: conversation.id, message: error?.message || String(error) });
      return serverRows;
    }
  }

  async refreshLocalMessages(conversationId = this.getConversation()?.id) {
    const conversation = this.getConversation();
    const e2eDirect = conversation?.type === 'direct' && (conversation?.is_secret === true || conversation?.e2e_mode === 'required');
    const e2ePrivateGroup = conversation?.type === 'group' && conversation?.is_private === true && conversation?.e2e_mode === 'required';
    if (!conversation?.id || String(conversation.id) !== String(conversationId) || !(e2eDirect || e2ePrivateGroup)) return [];
    const merged = await this.mergeLocalRows(this.getMessages() || [], conversation);
    if (String(this.getConversation()?.id) !== String(conversationId)) return [];
    this.setMessages(merged);
    await this.render();
    return merged;
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
    const withLocal = await this.mergeLocalRows(this.applyJournal(merged, sequenceAtStart), this.getConversation());
    if (String(this.getConversation()?.id) !== String(conversationId)) return;
    this.setMessages(withLocal);
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
