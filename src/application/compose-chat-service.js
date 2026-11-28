import { Err, Ok } from '../core/result.js';
import { validateUsername } from '../domain/username.js';

/**
 * Compose entrypoints for new direct / group chats.
 */
export class ComposeChatService {
  constructor({
    client,
    getUser,
    notify = () => {},
    prompt = globalThis.prompt?.bind(globalThis),
    reloadConversations = async () => {},
    openConversation = async () => {},
    startSecretWith = null,
    logger = null
  } = {}) {
    this.client = client;
    this.getUser = getUser;
    this.notify = notify;
    this.prompt = prompt || (() => null);
    this.reloadConversations = reloadConversations;
    this.openConversation = openConversation;
    this.startSecretWith = startSecretWith;
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

  async newDirect() {
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Требуется вход в РИМ.'));
    const raw = this.prompt('Введи username пользователя без символа @:');
    if (raw === null) return Ok({ cancelled: true });
    const parsed = validateUsername(raw);
    if (!parsed.ok) {
      // Empty after trim → treat as cancel; invalid format → error
      if (!String(raw || '').trim()) return Ok({ cancelled: true });
      return Err(new Error(parsed.error));
    }
    const username = parsed.username;

    return this.exclusive(`direct:${username}`, async () => {
      const { data: profile, error } = await this.client
        .from('profiles')
        .select('id,username,display_name')
        .eq('username', username)
        .maybeSingle();
      if (error) return Err(error);
      if (!profile) return Err(new Error('Пользователь не найден.'));
      if (String(profile.id) === String(user.id)) {
        return Err(new Error('Нельзя создать переписку с самим собой.'));
      }
      const { data, error: rpcError } = await this.client.rpc('start_direct_chat', {
        other_user: profile.id
      });
      if (rpcError) return Err(rpcError);
      const conversationId = typeof data === 'string' ? data : data?.id;
      await this.reloadConversations();
      if (conversationId) await this.openConversation(conversationId);
      return Ok(conversationId || data);
    });
  }

  async newSecretDirect() {
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Требуется вход в РИМ.'));
    if (typeof this.startSecretWith !== 'function') return Err(new Error('Модуль секретных чатов пока недоступен.'));
    const raw = this.prompt('Username пользователя для секретного чата:');
    if (raw === null) return Ok({ cancelled: true });
    const parsed = validateUsername(raw);
    if (!parsed.ok) {
      if (!String(raw || '').trim()) return Ok({ cancelled: true });
      return Err(new Error(parsed.error));
    }
    const username = parsed.username;
    return this.exclusive(`secret-direct:${username}`, async () => {
      const { data: profile, error } = await this.client.from('profiles')
        .select('id,username').eq('username', username).maybeSingle();
      if (error) return Err(error);
      if (!profile) return Err(new Error('Пользователь не найден.'));
      if (String(profile.id) === String(user.id)) return Err(new Error('Нельзя создать секретный чат с самим собой.'));
      const result = await this.startSecretWith(profile.id);
      if (!result?.ok) return Err(result?.error || new Error('Не удалось создать секретный чат.'));
      return Ok(result.value || true);
    });
  }

  async newGroup() {
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Требуется вход в РИМ.'));
    const title = this.prompt('Название группы:');
    if (title === null) return Ok({ cancelled: true });
    const normalizedTitle = String(title || '').trim();
    if (!normalizedTitle) return Ok({ cancelled: true });

    const names = this.prompt('Username участников через запятую. Можно оставить пустым:');
    if (names === null) return Ok({ cancelled: true });
    const usernames = [];
    for (const part of String(names || '').split(',')) {
      const value = String(part || '').trim();
      if (!value) continue;
      const parsed = validateUsername(value);
      if (!parsed.ok) return Err(new Error(parsed.error));
      usernames.push(parsed.username);
    }

    return this.exclusive(`group:${normalizedTitle.toLowerCase()}`, async () => {
      let ids = [];
      if (usernames.length) {
        const { data: profiles, error } = await this.client
          .from('profiles')
          .select('id,username')
          .in('username', [...new Set(usernames)]);
        if (error) return Err(error);
        const found = new Set((profiles || []).map(profile => String(profile.username || '').toLowerCase()));
        if (usernames.some(username => !found.has(username))) {
          return Err(new Error('Один или несколько участников не найдены.'));
        }
        ids = [...new Set((profiles || []).map(profile => profile.id).filter(Boolean))];
      }

      const { data, error: rpcError } = await this.client.rpc('rim_create_group_chat', {
        p_title: normalizedTitle,
        p_invited_users: ids,
        p_is_private: true,
        p_avatar_path: null
      });
      if (rpcError) return Err(rpcError);
      const conversationId = typeof data === 'string' ? data : data?.id;
      if (!conversationId) return Err(new Error('Сервер не вернул идентификатор группы.'));
      await this.reloadConversations();
      await this.openConversation(conversationId);
      return Ok(conversationId);
    });
  }
}
