import { Err, Ok } from '../../core/result.js';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function normalizeLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(number)));
}

export function messageCursor(message) {
  if (!message?.created_at || !message?.id) return null;
  return Object.freeze({ created_at: message.created_at, id: String(message.id) });
}

export function mergeMessageEvent(rows, payload) {
  const event = payload?.eventType || payload?.event;
  const record = event === 'DELETE' ? payload?.old : payload?.new;
  if (!record?.id) return rows;
  const index = rows.findIndex(item => String(item.id) === String(record.id));
  if (event === 'DELETE') return index < 0 ? rows : rows.filter(item => String(item.id) !== String(record.id));
  if (index < 0) return event === 'INSERT' ? [...rows, record].sort(compareMessages) : rows;
  const next = rows.slice();
  next[index] = { ...next[index], ...record };
  return next.sort(compareMessages);
}

export function compareMessages(a, b) {
  const time = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  if (time) return time;
  return String(a.id).localeCompare(String(b.id));
}

export class MessageRepository {
  constructor(client, { pageSize = DEFAULT_PAGE_SIZE } = {}) {
    this.client = client;
    this.pageSize = normalizeLimit(pageSize);
  }

  async getLatest(conversationId, { limit = this.pageSize } = {}) {
    if (!conversationId) return Err(new Error('conversationId is required'));
    const response = await this.client.from('chat_messages')
      .select('id,conversation_id,sender_id,body,image_path,reply_to_message_id,created_at,edited_at,sticker_id,topic_id,forwarded_from_user_id,forwarded_from_message_id,forwarded_hide_sender')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(normalizeLimit(limit));
    if (response.error) return Err(response.error);
    return Ok((response.data || []).slice().reverse());
  }

  async getBefore(conversationId, cursor, { limit = this.pageSize } = {}) {
    if (!conversationId || !cursor?.created_at || !cursor?.id) return Err(new Error('A valid conversation and message cursor are required'));
    const stamp = new Date(cursor.created_at);
    if (!Number.isFinite(stamp.getTime())) return Err(new Error('Invalid message cursor timestamp'));
    const safeId = String(cursor.id).replace(/[^a-zA-Z0-9-]/g, '');
    if (!safeId) return Err(new Error('Invalid message cursor id'));
    const response = await this.client.from('chat_messages')
      .select('id,conversation_id,sender_id,body,image_path,reply_to_message_id,created_at,edited_at,sticker_id,topic_id,forwarded_from_user_id,forwarded_from_message_id,forwarded_hide_sender')
      .eq('conversation_id', conversationId)
      .or(`created_at.lt.${stamp.toISOString()},and(created_at.eq.${stamp.toISOString()},id.lt.${safeId})`)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(normalizeLimit(limit));
    if (response.error) return Err(response.error);
    return Ok((response.data || []).slice().reverse());
  }

  async insert(payload) {
    const selection = 'id,conversation_id,sender_id,body,image_path,reply_to_message_id,created_at,edited_at,sticker_id,topic_id,forwarded_from_user_id,forwarded_from_message_id,forwarded_hide_sender';
    if (payload?.client_message_id) {
      const response = await this.client.from('chat_messages')
        .upsert(payload, { onConflict: 'sender_id,client_message_id', ignoreDuplicates: true })
        .select(selection).maybeSingle();
      if (response.error) return Err(response.error);
      if (response.data) return Ok(response.data);
      const existing = await this.client.from('chat_messages').select(selection)
        .eq('sender_id', payload.sender_id)
        .eq('client_message_id', payload.client_message_id)
        .single();
      return existing.error ? Err(existing.error) : Ok(existing.data);
    }
    const response = await this.client.from('chat_messages').insert(payload).select(selection).single();
    return response.error ? Err(response.error) : Ok(response.data);
  }

  async update(messageId, userId, body, conversationId) {
    let query = this.client.from('chat_messages').update({ body, edited_at: new Date().toISOString() }).eq('id', messageId).eq('sender_id', userId);
    if (conversationId) query = query.eq('conversation_id', conversationId);
    const response = await query.select('id,body,edited_at').maybeSingle();
    if (response.error) return Err(response.error);
    if (!response.data) return Err(new Error('Message was not found or cannot be edited'));
    return Ok(response.data);
  }

  async remove(messageId, userId, conversationId) {
    let query = this.client.from('chat_messages').delete().eq('id', messageId).eq('sender_id', userId);
    if (conversationId) query = query.eq('conversation_id', conversationId);
    const response = await query.select('id').maybeSingle();
    if (response.error) return Err(response.error);
    if (!response.data) return Err(new Error('Message was not found or cannot be deleted'));
    return Ok(response.data);
  }

  async react({ messageId, userId, emoji }) {
    if (!messageId || !userId || !emoji) {
      return Err(new Error('Reaction requires message, user and emoji.'));
    }
    const response = await this.client.from('message_reactions').upsert({
      message_id: messageId,
      user_id: userId,
      emoji: String(emoji).slice(0, 16)
    });
    return response.error ? Err(response.error) : Ok(true);
  }
}
