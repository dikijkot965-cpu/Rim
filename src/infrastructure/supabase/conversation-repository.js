import { Err, Ok } from '../../core/result.js';

const DEFAULT_BATCH_SIZE = 100;

function uniqueIds(values) {
  return [...new Set((values || []).filter(value => value != null && value !== '').map(String))];
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

export class ConversationRepository {
  constructor(client, { batchSize = DEFAULT_BATCH_SIZE } = {}) {
    this.client = client;
    const parsed = Number(batchSize);
    this.batchSize = Number.isFinite(parsed) ? Math.min(500, Math.max(1, Math.trunc(parsed))) : DEFAULT_BATCH_SIZE;
  }


  /**
   * Resolve a single conversation only after confirming the requesting user's membership.
   * This is an application-level access check; database RLS remains the security boundary.
   */
  async getAccessibleConversation(conversationId, userId) {
    if (!conversationId || !userId) {
      return Err(new Error('Conversation lookup requires both conversation and user IDs.'));
    }

    const membership = await this.client.from('conversation_members')
      .select('conversation_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();
    if (membership.error) return Err(membership.error);
    if (!membership.data) return Err(new Error('Переписка не найдена или нет доступа к ней.'));

    const conversation = await this.client.from('conversations')
      .select('*')
      .eq('id', conversationId)
      .maybeSingle();
    if (conversation.error) return Err(conversation.error);
    if (!conversation.data) return Err(new Error('Переписка не найдена или нет доступа к ней.'));
    return Ok(conversation.data);
  }

  /**
   * Membership-scoped conversation list for the chat sidebar.
   * Returns conversations the user belongs to, newest first.
   */
  async listForUser(userId) {
    if (!userId) return Err(new Error('Conversation list requires an authenticated user.'));

    const members = await this.client
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', userId);
    if (members.error) return Err(members.error);

    const ids = uniqueIds((members.data || []).map(row => row.conversation_id));
    if (!ids.length) return Ok([]);

    const conversations = [];
    for (const batch of chunks(ids, this.batchSize)) {
      const response = await this.client
        .from('conversations')
        .select('id,type,title,description,created_at,created_by,is_private,avatar_path,invite_code')
        .in('id', batch)
        .order('created_at', { ascending: false });
      if (response.error) return Err(response.error);
      conversations.push(...(response.data || []));
    }

    conversations.sort((a, b) => {
      const time = new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      if (time) return time;
      return String(a.id).localeCompare(String(b.id));
    });
    return Ok(conversations);
  }

  async getDirectPeers(conversationIds, currentUserId, { includePresence = true } = {}) {
    const ids = uniqueIds(conversationIds);
    if (!ids.length || !currentUserId) return Ok({});

    // Keep PostgREST `in` filters bounded for users with large conversation lists.
    // Sequential batches avoid turning one large request into a burst of concurrent queries.
    const peerByConversation = new Map();
    for (const batch of chunks(ids, this.batchSize)) {
      const members = await this.client.from('conversation_members')
        .select('conversation_id,user_id')
        .in('conversation_id', batch);
      if (members.error) return Err(members.error);
      for (const row of members.data || []) {
        if (String(row.user_id) === String(currentUserId)) continue;
        const conversationId = String(row.conversation_id);
        if (!peerByConversation.has(conversationId)) peerByConversation.set(conversationId, String(row.user_id));
      }
    }

    const peerIds = uniqueIds([...peerByConversation.values()]);
    if (!peerIds.length) return Ok({});

    const byId = new Map();
    for (const batch of chunks(peerIds, this.batchSize)) {
      const profiles = await this.client.from('profiles')
        .select('id,username,display_name,avatar_url,avatar_path,show_online')
        .in('id', batch);
      if (profiles.error) return Err(profiles.error);
      for (const profile of profiles.data || []) {
        byId.set(String(profile.id), {
          ...profile,
          showOnline: profile.show_online === true,
          last_seen_at: null
        });
      }
    }

    // Presence is fetched separately and only for profiles that explicitly enabled it.
    if (includePresence) {
      const visibleIds = [...byId.values()].filter(profile => profile.showOnline).map(profile => String(profile.id));
      for (const batch of chunks(visibleIds, this.batchSize)) {
        const presence = await this.client.from('profiles').select('id,last_seen_at').in('id', batch);
        if (presence.error) return Err(presence.error);
        for (const row of presence.data || []) {
          const profile = byId.get(String(row.id));
          if (profile) profile.last_seen_at = row.last_seen_at || null;
        }
      }
    }

    const result = {};
    for (const [conversationId, peerId] of peerByConversation) result[conversationId] = byId.get(peerId) || null;
    return Ok(result);
  }


  async getReadStates(conversationIds, userId) {
    const ids = uniqueIds(conversationIds);
    if (!ids.length || !userId) return Ok([]);
    const rows = [];
    for (const batch of chunks(ids, this.batchSize)) {
      const response = await this.client.from('conversation_read_state')
        .select('conversation_id,last_read_at')
        .eq('user_id', userId)
        .in('conversation_id', batch);
      if (response.error) return Err(response.error);
      rows.push(...(response.data || []));
    }
    return Ok(rows);
  }

  async countUnreadMessages(conversationId, userId, lastReadAt = null) {
    if (!conversationId || !userId) return Ok(0);
    let query = this.client.from('chat_messages').select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .neq('sender_id', userId);
    if (lastReadAt) query = query.gt('created_at', lastReadAt);
    const response = await query;
    return response.error ? Err(response.error) : Ok(response.count || 0);
  }

  async getLatestMessage(conversationId) {
    if (!conversationId) return Ok(null);
    const response = await this.client.from('chat_messages')
      .select('id,conversation_id,sender_id,body,image_path,attachment_path,attachment_name,sticker_id,created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    return response.error ? Err(response.error) : Ok(response.data || null);
  }

  async markRead(payload) {
    const response = await this.client.from('conversation_read_state')
      .upsert(payload, { onConflict: 'user_id,conversation_id' });
    return response.error ? Err(response.error) : Ok(true);
  }

  async getPeerPresence(peerId) {
    if (!peerId) return Ok(null);
    const response = await this.client.from('profiles').select('id,last_seen_at,show_online').eq('id', peerId).maybeSingle();
    if (response.error) return Err(response.error);
    const row = response.data;
    if (!row) return Ok(null);
    return Ok({ showOnline: row.show_online === true, last_seen_at: row.show_online === true ? (row.last_seen_at || null) : null });
  }

  async getDirectPeer(conversationId, currentUserId) {
    const result = await this.getDirectPeers([conversationId], currentUserId, { includePresence: true });
    if (!result.ok) return result;
    return Ok(result.value[String(conversationId)] || null);
  }
}
