/**
 * Owns the application-level conversation projection: activity ordering, unread counters,
 * latest-message previews, read cursor writes, and chat-list Realtime updates.
 * The legacy renderer remains the DOM contract; this controller owns the state feeding it.
 */
import {
  conversationActivityTime,
  compareConversationsByActivity as compareConversations,
  messagePreview
} from '../domain/conversation.js';

export { conversationActivityTime, compareConversations, messagePreview };

function resultValue(result, fallback) {
  if (!result?.ok) throw result?.error || new Error('Conversation state operation failed');
  return result.value ?? fallback;
}

export class ConversationStateController {
  constructor({ repository, client, getConversations, getUser, getActiveConversation, getMessages, renderList, logger, maxConcurrentCounts = 6 }) {
    this.repository = repository;
    this.client = client;
    this.getConversations = getConversations;
    this.getUser = getUser;
    this.getActiveConversation = getActiveConversation;
    this.getMessages = getMessages;
    this.renderList = renderList;
    this.logger = logger;
    this.maxConcurrentCounts = Math.max(1, Math.min(12, Math.trunc(maxConcurrentCounts) || 6));
    this.refreshToken = 0;
    this.messageChannel = null;
    this.readStateChannel = null;
    this.startedForUser = null;
    this.lastMarkedMessageByConversation = new Map();
  }

  sort() {
    const rows = this.getConversations?.() || [];
    rows.sort(compareConversations);
    return rows;
  }

  noteOutgoing(message, conversationId) {
    const id = conversationId || message?.conversation_id;
    if (!id) return;
    const chat = (this.getConversations?.() || []).find(row => String(row.id) === String(id));
    if (!chat) return;
    chat._rimLastMessageAt = message?.created_at || new Date().toISOString();
    chat._rimLastMessageId = message?.id || null;
    chat._rimLastMessagePreview = messagePreview(message);
    this.sort();
    try { this.renderList?.(); } catch { /* ignore */ }
  }

  async hydrateActivity(conversationIds = null) {
    const rows = this.getConversations?.() || [];
    const allowedIds = new Set(eligibleRows.map(row => String(row.id)));
    const ids = (conversationIds || [...allowedIds]).map(String).filter(id => allowedIds.has(id));
    if (!ids.length || !this.client) return;
    const token = ++this.refreshToken;
    try {
      // Newest messages across the membership set; derive per-chat last activity client-side.
      const { data, error } = await this.client
        .from('chat_messages')
        .select('id,conversation_id,body,image_path,sticker_id,created_at')
        .in('conversation_id', ids.slice(0, 200))
        .order('created_at', { ascending: false })
        .limit(Math.min(500, Math.max(50, ids.length * 3)));
      if (error) throw error;
      if (token !== this.refreshToken) return;
      const latest = new Map();
      for (const message of data || []) {
        const key = String(message.conversation_id);
        if (!latest.has(key)) latest.set(key, message);
      }
      for (const chat of rows) {
        const message = latest.get(String(chat.id));
        if (!message) continue;
        chat._rimLastMessageAt = message.created_at;
        chat._rimLastMessageId = message.id;
        chat._rimLastMessagePreview = messagePreview(message);
      }
      this.sort();
      try { this.renderList?.(); } catch { /* ignore */ }
    } catch (error) {
      this.logger?.warn?.('conversations.activity.hydrate.failed', { message: error?.message });
    }
  }

  async refreshUnread(onlyConversationIds = null) {
    const token = ++this.refreshToken;
    const user = this.getUser?.();
    const allConversations = this.getConversations?.() || [];
    const filterIds = onlyConversationIds ? new Set(onlyConversationIds.map(String)) : null;
    const eligible = allConversations.filter(chat => chat?._rimEntityKind !== 'channel' && chat?.type !== 'channel');
    const conversations = filterIds ? eligible.filter(chat => filterIds.has(String(chat.id))) : eligible;
    if (!user?.id || !conversations.length) {
      for (const chat of conversations) chat._rimUnreadCount = 0;
      return;
    }
    const ids = conversations.map(chat => String(chat.id)).filter(Boolean);
    try {
      const states = resultValue(await this.repository.getReadStates(ids, user.id), []);
      const readAt = new Map((states || []).map(row => [String(row.conversation_id), row.last_read_at || null]));
      const counts = new Map();
      let cursor = 0;
      const workers = Array.from({ length: Math.min(this.maxConcurrentCounts, ids.length) }, async () => {
        while (cursor < ids.length) {
          const index = cursor++;
          const id = ids[index];
          const count = resultValue(await this.repository.countUnreadMessages(id, user.id, readAt.get(id)), 0);
          counts.set(id, Number(count) || 0);
        }
      });
      await Promise.all(workers);
      if (token !== this.refreshToken || String(this.getUser?.()?.id) !== String(user.id)) return;
      for (const chat of conversations) chat._rimUnreadCount = counts.get(String(chat.id)) || 0;
      this.renderList?.();
    } catch (error) {
      if (token === this.refreshToken) this.logger?.warn?.('chat.unread.refresh.failed', { message: error?.message });
    }
  }

  async markActiveConversationRead() {
    const user = this.getUser?.();
    const conversation = this.getActiveConversation?.();
    if (!user?.id || !conversation?.id) return false;
    const messages = this.getMessages?.() || [];
    if (!messages.length) return false;
    const latest = messages.reduce((best, row) => {
      if (!best) return row;
      const delta = new Date(row.created_at || 0).getTime() - new Date(best.created_at || 0).getTime();
      return delta > 0 || (delta === 0 && String(row.id) > String(best.id)) ? row : best;
    }, null);
    if (!latest?.id || !latest.created_at) return false;
    const conversationKey = String(conversation.id);
    if (this.lastMarkedMessageByConversation.get(conversationKey) === String(latest.id)) return true;
    const result = await this.repository.markRead({
      user_id: user.id,
      conversation_id: conversation.id,
      last_read_message_id: latest.id,
      last_read_at: latest.created_at
    });
    if (!result.ok) {
      this.logger?.warn?.('chat.read_state.write.failed', { message: result.error?.message, conversationId: conversation.id });
      return false;
    }
    this.lastMarkedMessageByConversation.set(conversationKey, String(latest.id));
    conversation._rimUnreadCount = 0;
    this.renderList?.();
    return true;
  }

  async applyMessageEvent(payload) {
    const event = String(payload?.eventType || payload?.event || '').toUpperCase();
    const message = event === 'DELETE' ? payload?.old : payload?.new;
    if (!message?.conversation_id) return;
    const rows = this.getConversations?.() || [];
    const chat = rows.find(row => row?._rimEntityKind !== 'channel' && row?.type !== 'channel' && String(row.id) === String(message.conversation_id));
    if (!chat) return;

    if (event === 'INSERT') {
      chat._rimLastMessageAt = message.created_at || new Date().toISOString();
      chat._rimLastMessageId = message.id || null;
      chat._rimLastMessagePreview = messagePreview(message);
      if (String(message.sender_id) !== String(this.getUser?.()?.id) && String(this.getActiveConversation?.()?.id) !== String(chat.id)) {
        chat._rimUnreadCount = (Number(chat._rimUnreadCount) || 0) + 1;
      }
    } else if (event === 'UPDATE' || event === 'DELETE') {
      const knownLatest = chat._rimLastMessageId
        ? String(chat._rimLastMessageId) === String(message.id)
        : (!chat._rimLastMessageAt && !chat.last_message_at) || new Date(message.created_at || 0).getTime() >= conversationActivityTime(chat);
      if (knownLatest && event === 'UPDATE') chat._rimLastMessagePreview = messagePreview(message);
      if (knownLatest && event === 'DELETE') {
        const latest = resultValue(await this.repository.getLatestMessage(chat.id), null);
        chat._rimLastMessageAt = latest?.created_at || null;
        chat._rimLastMessageId = latest?.id || null;
        chat._rimLastMessagePreview = latest ? messagePreview(latest) : '';
      }
    }
    this.sort();
    this.renderList?.();
  }

  async startRealtime() {
    const user = this.getUser?.();
    if (!user?.id || !this.client) return;
    if (this.startedForUser === String(user.id) && this.messageChannel && this.readStateChannel) return;
    await this.stopRealtime();
    this.startedForUser = String(user.id);
    const userId = String(user.id);
    this.messageChannel = this.client.channel(`rim-conversation-projection-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, payload => {
        this.applyMessageEvent(payload).catch(error => this.logger?.warn?.('chat.list.realtime.failed', { message: error?.message }));
      })
      .subscribe();
    this.readStateChannel = this.client.channel(`rim-conversation-read-cursor-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_read_state', filter: `user_id=eq.${userId}` }, payload => {
        const conversationId = payload?.new?.conversation_id || payload?.old?.conversation_id;
        this.refreshUnread(conversationId ? [conversationId] : null).catch(error => this.logger?.warn?.('chat.unread.realtime.failed', { message: error?.message }));
      })
      .subscribe();
  }

  async stopRealtime() {
    this.refreshToken++;
    const channels = [this.messageChannel, this.readStateChannel].filter(Boolean);
    this.messageChannel = null;
    this.readStateChannel = null;
    this.startedForUser = null;
    await Promise.all(channels.map(async channel => {
      try { if (this.client?.removeChannel) await this.client.removeChannel(channel); }
      catch (error) { this.logger?.warn?.('chat.list.realtime.dispose.failed', { message: error?.message }); }
    }));
  }
}
