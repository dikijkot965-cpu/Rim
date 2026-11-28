import { Err, Ok } from '../core/result.js';

/**
 * Direct-chat discovery and start boundary.
 * Owns profile lookup + start_direct_chat RPC; presentation stays on modal helpers.
 */
export class DirectChatService {
  constructor({
    client,
    getUser,
    notify = () => {},
    showProfile = null,
    reloadConversations = async () => {},
    openConversation = async () => {},
    logger = null
  } = {}) {
    this.client = client;
    this.getUser = getUser;
    this.notify = notify;
    this.showProfile = showProfile;
    this.reloadConversations = reloadConversations;
    this.openConversation = openConversation;
    this.logger = logger;
    this.inFlight = new Set();
  }

  async exclusive(key, operation) {
    if (this.inFlight.has(key)) return Err(new Error('Операция уже выполняется.'));
    this.inFlight.add(key);
    try { return await operation(); }
    catch (error) { return Err(error); }
    finally { this.inFlight.delete(key); }
  }

  async findByUsername(username) {
    const name = String(username ?? '').trim().replace(/^@/, '');
    if (!name) return Err(new Error('Укажите username.'));

    return this.exclusive(`find:${name}`, async () => {
      const { data, error } = await this.client
        .from('profiles')
        .select('id,username,display_name,bio,avatar_url,avatar_path,show_online')
        .eq('username', name)
        .maybeSingle();
      if (error) return Err(error);
      if (!data) return Err(new Error('Пользователь не найден.'));

      if (data.avatar_path && !data.avatar_url) {
        try {
          const { data: signed } = await this.client.storage.from('avatars').createSignedUrl(data.avatar_path, 3600);
          if (signed?.signedUrl) data.avatar_url = signed.signedUrl;
        } catch { /* ignore */ }
      }

      try { this.showProfile?.(data); } catch (error) {
        this.logger?.warn?.('profile.show.failed', { message: error?.message });
      }
      return Ok(data);
    });
  }

  async startSecretWith(userId) {
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Требуется вход в РИМ.'));
    if (!userId || String(userId) === String(user.id)) return Err(new Error('Нельзя создать секретный чат с самим собой.'));
    return this.exclusive(`secret:${userId}`, async () => {
      const { data, error } = await this.client.rpc('rim_create_secret_direct_chat', { p_other_user: userId });
      if (error) return Err(error);
      const conversationId = typeof data === 'string' ? data : data?.id;
      if (!conversationId) return Err(new Error('Supabase не вернул ID секретного диалога.'));
      await this.reloadConversations();
      await this.openConversation(conversationId);
      return Ok(conversationId);
    });
  }

  async acceptSecretRequest(requestId) {
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Требуется вход в РИМ.'));
    if (!requestId) return Err(new Error('Не указан запрос на секретный чат.'));
    return this.exclusive(`secret-accept:${requestId}`, async () => {
      const { data, error } = await this.client.rpc('rim_accept_secret_chat_request', { p_request_id: requestId });
      if (error) return Err(error);
      const conversationId = typeof data === 'string' ? data : data?.conversation_id || data?.id;
      if (!conversationId) return Err(new Error('Сервер не вернул ID принятого секретного чата.'));
      await this.reloadConversations();
      await this.openConversation(conversationId);
      return Ok(conversationId);
    });
  }

  async declineSecretRequest(requestId) {
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Требуется вход в РИМ.'));
    if (!requestId) return Err(new Error('Не указан запрос на секретный чат.'));
    return this.exclusive(`secret-decline:${requestId}`, async () => {
      const { data, error } = await this.client.rpc('rim_decline_secret_chat_request', { p_request_id: requestId });
      if (error) return Err(error);
      await this.reloadConversations();
      return Ok(data ?? true);
    });
  }

  async startWith(userId) {
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Требуется вход в РИМ.'));
    if (!userId) return Err(new Error('Не указан пользователь.'));
    if (String(userId) === String(user.id)) return Err(new Error('Нельзя начать чат с самим собой.'));

    return this.exclusive(`start:${userId}`, async () => {
      const { data, error } = await this.client.rpc('start_direct_chat', { other_user: userId });
      if (error) return Err(error);
      const conversationId = typeof data === 'string' ? data : data?.id;
      await this.reloadConversations();
      if (conversationId) await this.openConversation(conversationId);
      return Ok(conversationId || data);
    });
  }
}
