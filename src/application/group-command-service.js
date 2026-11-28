import { canRemoveMember, normalizeMemberRole } from '../domain/membership.js';
import { Err, Ok } from '../core/result.js';

/**
 * Group mutation boundary over existing Supabase RPCs / tables.
 */
export class GroupCommandService {
  constructor({
    client,
    getUser,
    getConversations = () => [],
    notify = () => {},
    closeModal = () => {},
    afterCreate = async () => {},
    reopenSettings = async () => {},
    openConversation = async () => {},
    reloadConversations = async () => {},
    confirm = globalThis.confirm?.bind(globalThis),
    prompt = globalThis.prompt?.bind(globalThis),
    logger = null
  } = {}) {
    this.client = client;
    this.getUser = getUser;
    this.getConversations = getConversations;
    this.notify = notify;
    this.closeModal = closeModal;
    this.afterCreate = afterCreate;
    this.reopenSettings = reopenSettings;
    this.openConversation = openConversation;
    this.reloadConversations = reloadConversations;
    this.confirm = confirm || (() => true);
    this.prompt = prompt || (() => null);
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

  #requireUser() {
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Требуется вход в РИМ.'));
    return Ok(user);
  }

  async create({
    title,
    memberUsernames = [],
    isPublic = false,
    avatarFile = null
  } = {}) {
    const user = this.#requireUser();
    if (!user.ok) return user;

    const groupTitle = String(title ?? '').trim();
    if (!groupTitle || groupTitle.length > 60) {
      return Err(new Error('Название группы должно содержать от 1 до 60 символов.'));
    }

    const names = [...new Set((memberUsernames || [])
      .map(name => String(name || '').trim().replace(/^@/, '').toLowerCase())
      .filter(Boolean))];

    return this.exclusive('group-create', async () => {
      let ids = [];
      if (names.length) {
        const { data, error } = await this.client
          .from('profiles')
          .select('id,username')
          .in('username', names);
        if (error) return Err(error);
        const found = new Set((data || []).map(row => String(row.username || '').toLowerCase()));
        if (names.some(name => !found.has(name))) {
          return Err(new Error('Проверь usernames участников: некоторые не найдены.'));
        }
        ids = [...new Set((data || []).map(row => row.id).filter(Boolean))];
      }

      let avatarPath = null;
      if (avatarFile) {
        if (avatarFile.size > 3 * 1024 * 1024) {
          return Err(new Error('Аватар группы не должен превышать 3 МБ.'));
        }
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(avatarFile.type)) {
          return Err(new Error('Формат аватара не поддерживается.'));
        }
        const ext = (avatarFile.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        avatarPath = `${user.value.id}/groups/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await this.client.storage.from('avatars').upload(avatarPath, avatarFile, {
          contentType: avatarFile.type,
          upsert: false
        });
        if (uploadError) return Err(uploadError);
      }

      const created = await this.client.rpc('create_group_chat', {
        group_title: groupTitle,
        invited_users: ids
      });
      if (created.error) {
        if (avatarPath) await this.client.storage.from('avatars').remove([avatarPath]);
        return Err(created.error);
      }

      const conversationId = typeof created.data === 'string'
        ? created.data
        : created.data?.id || created.data?.conversation_id;
      if (!conversationId) {
        if (avatarPath) await this.client.storage.from('avatars').remove([avatarPath]);
        return Err(new Error('Сервер создал группу, но не вернул её идентификатор.'));
      }

      const settings = await this.client.rpc('rim_group_update_settings', {
        p_conversation_id: conversationId,
        p_title: groupTitle,
        p_description: '',
        p_is_private: !isPublic,
        p_avatar_path: avatarPath
      });

      this.closeModal?.();
      try {
        await this.afterCreate(conversationId);
      } catch (error) {
        this.logger?.warn?.('group.create.refresh.failed', { conversationId, message: error?.message });
      }

      if (settings.error) {
        if (avatarPath) await this.client.storage.from('avatars').remove([avatarPath]);
        this.logger?.warn?.('group.create.settings.failed', { conversationId, message: settings.error.message });
        return Ok({
          id: conversationId,
          warning: 'Группа создана, но не удалось применить настройки публичности. Она осталась закрытой.'
        });
      }

      return Ok({ id: conversationId, ...(settings.data || {}) });
    });
  }

  async joinPublic(conversationId) {
    const user = this.#requireUser();
    if (!user.ok) return user;
    if (!conversationId) return Err(new Error('Не указана группа.'));

    return this.exclusive(`group-join-public:${conversationId}`, async () => {
      const { data, error } = await this.client.rpc('rim_group_join_public', {
        p_conversation_id: conversationId
      });
      if (error) return Err(error);
      const joinedId = data || conversationId;
      await this.reloadConversations();
      await this.openConversation(joinedId);
      return Ok(joinedId);
    });
  }

  async saveSettings(conversationId, { title, description = '', isPrivate = true } = {}) {
    const user = this.#requireUser();
    if (!user.ok) return user;
    if (!conversationId) return Err(new Error('Не указана группа.'));
    const groupTitle = String(title ?? '').trim();
    if (!groupTitle) return Err(new Error('Название обязательно.'));

    return this.exclusive(`group-save:${conversationId}`, async () => {
      const { data, error } = await this.client.rpc('rim_group_update_settings', {
        p_conversation_id: conversationId,
        p_title: groupTitle,
        p_description: description || '',
        p_is_private: isPrivate !== false,
        p_avatar_path: null
      });
      if (error) return Err(error);

      const chat = (this.getConversations?.() || []).find(row => String(row.id) === String(conversationId));
      if (chat && data) Object.assign(chat, data);

      this.closeModal?.();
      await this.openConversation(conversationId);
      return Ok(data || true);
    });
  }

  async addMember(conversationId, username) {
    const user = this.#requireUser();
    if (!user.ok) return user;
    const name = String(username ?? '').trim();
    if (!conversationId || !name) return Err(new Error('Введите @username.'));

    return this.exclusive(`group-add:${conversationId}:${name}`, async () => {
      const { error } = await this.client.rpc('rim_group_add_member', {
        p_conversation_id: conversationId,
        p_username: name
      });
      if (error) return Err(error);
      await this.reopenSettings(conversationId);
      return Ok(true);
    });
  }

  async removeMember(conversationId, userId, { skipConfirm = false } = {}) {
    const user = this.#requireUser();
    if (!user.ok) return user;
    if (!conversationId || !userId) return Err(new Error('Не указан участник.'));
    if (!skipConfirm && !this.confirm('Удалить участника из группы?')) return Ok({ cancelled: true });

    return this.exclusive(`group-remove:${conversationId}:${userId}`, async () => {
      const { error } = await this.client.rpc('rim_group_remove_member', {
        p_conversation_id: conversationId,
        p_user_id: userId
      });
      if (error) return Err(error);
      await this.reopenSettings(conversationId);
      return Ok(true);
    });
  }

  async setRole(conversationId, userId, role) {
    const user = this.#requireUser();
    if (!user.ok) return user;
    if (!conversationId || !userId || !role) return Err(new Error('Не указаны группа, участник или роль.'));
    const normalizedRole = normalizeMemberRole(role);

    return this.exclusive(`group-role:${conversationId}:${userId}`, async () => {
      const { error } = await this.client.rpc('rim_group_set_member_role', {
        p_conversation_id: conversationId,
        p_user_id: userId,
        p_role: normalizedRole
      });
      if (error) return Err(error);
      await this.reopenSettings(conversationId);
      return Ok(true);
    });
  }

  async leave(conversationId, { skipConfirm = false } = {}) {
    const user = this.#requireUser();
    if (!user.ok) return user;
    if (!conversationId) return Err(new Error('Не указана группа.'));
    if (!skipConfirm && !this.confirm('Покинуть группу?')) return Ok({ cancelled: true });

    return this.exclusive(`group-leave:${conversationId}`, async () => {
      const { error } = await this.client.rpc('rim_group_leave', { p_conversation_id: conversationId });
      if (error) return Err(error);
      await this.reloadConversations();
      return Ok(true);
    });
  }

  async uploadAvatar(conversationId, file) {
    const user = this.#requireUser();
    if (!user.ok) return user;
    if (!conversationId || !file) return Err(new Error('Нет файла или группы.'));
    if (file.size > 3 * 1024 * 1024) return Err(new Error('Аватар группы не должен превышать 3 МБ.'));
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      return Err(new Error('Формат аватара не поддерживается.'));
    }

    return this.exclusive(`group-avatar:${conversationId}`, async () => {
      const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${user.value.id}/groups/${conversationId}/${crypto.randomUUID()}.${ext}`;
      const { error: up } = await this.client.storage.from('avatars').upload(path, file, {
        contentType: file.type || 'image/jpeg',
        upsert: false
      });
      if (up) return Err(up);

      const current = await this.client
        .from('conversations')
        .select('title,description,is_private')
        .eq('id', conversationId)
        .single();
      if (current.error) {
        try { await this.client.storage.from('avatars').remove([path]); } catch { /* ignore */ }
        return Err(current.error);
      }

      const { data, error } = await this.client.rpc('rim_group_update_settings', {
        p_conversation_id: conversationId,
        p_title: current.data?.title || 'Группа',
        p_description: current.data?.description || '',
        p_is_private: current.data?.is_private,
        p_avatar_path: path
      });
      if (error) {
        try { await this.client.storage.from('avatars').remove([path]); } catch { /* ignore */ }
        return Err(error);
      }

      const chat = (this.getConversations?.() || []).find(row => String(row.id) === String(conversationId));
      if (chat) chat.avatar_path = path;

      await this.reopenSettings(conversationId);
      return Ok(data || true);
    });
  }

  async createInvite(conversationId) {
    const user = this.#requireUser();
    if (!user.ok) return user;
    if (!conversationId) return Err(new Error('Не указана группа.'));

    return this.exclusive(`group-invite:${conversationId}`, async () => {
      const { data, error } = await this.client.rpc('rim_group_create_invite', {
        p_conversation_id: conversationId
      });
      if (error) return Err(error);
      await this.reopenSettings(conversationId);
      return Ok(data);
    });
  }

  async revokeInvite(conversationId, { skipConfirm = false } = {}) {
    const user = this.#requireUser();
    if (!user.ok) return user;
    if (!conversationId) return Err(new Error('Не указана группа.'));
    if (!skipConfirm && !this.confirm('Отозвать ссылку приглашения?')) return Ok({ cancelled: true });

    return this.exclusive(`group-invite-revoke:${conversationId}`, async () => {
      const { error } = await this.client.rpc('rim_group_revoke_invite', {
        p_conversation_id: conversationId
      });
      if (error) return Err(error);
      await this.reopenSettings(conversationId);
      return Ok(true);
    });
  }

  async transferOwner(conversationId, username, { skipConfirm = false } = {}) {
    const user = this.#requireUser();
    if (!user.ok) return user;
    if (!conversationId) return Err(new Error('Не указана группа.'));
    const name = String(username ?? '').trim().replace(/^@/, '');
    if (!name) return Ok({ cancelled: true });

    return this.exclusive(`group-transfer:${conversationId}`, async () => {
      const { data: profile, error: pe } = await this.client
        .from('profiles')
        .select('id,username')
        .eq('username', name)
        .maybeSingle();
      if (pe) return Err(pe);
      if (!profile) return Err(new Error('Пользователь не найден.'));
      if (!skipConfirm && !this.confirm(`Передать владение группе пользователю @${profile.username}? Это действие нельзя отменить автоматически.`)) {
        return Ok({ cancelled: true });
      }

      const { error } = await this.client.rpc('rim_group_transfer_owner', {
        p_conversation_id: conversationId,
        p_new_owner_id: profile.id
      });
      if (error) return Err(error);
      this.closeModal?.();
      await this.openConversation(conversationId);
      return Ok(true);
    });
  }

  async joinByInvite(code) {
    const user = this.#requireUser();
    if (!user.ok) return user;
    const value = String(code ?? '').trim();
    if (!value) return Ok({ cancelled: true });

    return this.exclusive(`group-join-invite:${value}`, async () => {
      const { data, error } = await this.client.rpc('rim_group_join_invite', { p_code: value });
      if (error) return Err(error);
      await this.reloadConversations();
      if (data) await this.openConversation(data);
      return Ok(data);
    });
  }
}
