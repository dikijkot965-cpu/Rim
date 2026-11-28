import { normalizeChannelTitle, normalizeChannelHandle, normalizeChannelPostBody, canPublishToChannel } from '../domain/channel.js';
import { Err, Ok } from '../core/result.js';

/**
 * Application boundary for channel membership and moderation RPCs.
 * Does not invent SQL: delegates to existing Supabase RPC contracts.
 */
export class ChannelCommandService {
  constructor({
    client,
    getUser,
    notify = () => {},
    reloadDirectory = async () => {},
    reloadChannel = async () => {},
    reopenSettings = async () => {},
    getChannel = () => null,
    setChannel = () => {},
    confirm = globalThis.confirm?.bind(globalThis),
    prompt = globalThis.prompt?.bind(globalThis),
    closeModal = null,
    logger = null
  } = {}) {
    this.client = client;
    this.getUser = getUser;
    this.notify = notify;
    this.reloadDirectory = reloadDirectory;
    this.reloadChannel = reloadChannel;
    this.reopenSettings = reopenSettings;
    this.getChannel = getChannel;
    this.setChannel = setChannel;
    this.confirm = confirm || (() => true);
    this.prompt = prompt || (() => null);
    this.logger = logger;
    this.inFlight = new Set();
  }

  async create({
    title,
    description = '',
    username = null,
    isPublic = true,
    avatarFile = null
  } = {}) {
    const current = this.getUser?.();
    if (!current?.id) return Err(new Error('Требуется вход в РИМ.'));

    const titleResult = normalizeChannelTitle(title);
    if (!titleResult.ok) return Err(new Error(titleResult.error));
    const channelTitle = titleResult.value;

    let channelUsername = null;
    if (username != null && String(username).trim() !== '') {
      const handleResult = normalizeChannelHandle(username);
      if (!handleResult.ok) return Err(new Error(handleResult.error));
      channelUsername = handleResult.value;
    }

    return this.exclusive('channel-create', async () => {
      let avatarPath = null;
      if (avatarFile) {
        if (avatarFile.size > 3 * 1024 * 1024) {
          return Err(new Error('Аватар не должен превышать 3 МБ.'));
        }
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(avatarFile.type)) {
          return Err(new Error('Формат аватара не поддерживается.'));
        }
        const ext = (avatarFile.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const path = `${current.id}/channels/${crypto.randomUUID()}.${ext}`;
        const { error: up } = await this.client.storage.from('avatars').upload(path, avatarFile, {
          contentType: avatarFile.type || 'image/jpeg',
          upsert: false
        });
        if (up) return Err(up);
        avatarPath = path;
      }

      const { data, error } = await this.client
        .from('channels')
        .insert({
          title: channelTitle,
          description: String(description || '').trim(),
          owner_id: current.id,
          is_public: !!isPublic,
          username: channelUsername,
          avatar_path: avatarPath
        })
        .select()
        .single();
      if (error) {
        if (avatarPath) {
          try { await this.client.storage.from('avatars').remove([avatarPath]); } catch { /* ignore */ }
        }
        return Err(error);
      }

      const { error: memberError } = await this.client.from('channel_members').upsert({
        channel_id: data.id,
        user_id: current.id,
        role: 'admin'
      });
      if (memberError) {
        this.logger?.error?.('channel.create.owner_membership_failed', {
          channelId: data?.id || null,
          message: memberError.message || String(memberError)
        });
        let rollbackError = null;
        if (data?.id) {
          const rollback = await this.client.from('channels').delete().eq('id', data.id);
          rollbackError = rollback?.error || null;
        }
        if (avatarPath) {
          const cleanup = await this.client.storage.from('avatars').remove([avatarPath]);
          if (cleanup?.error) {
            this.logger?.warn?.('channel.create.avatar_cleanup_failed', {
              message: cleanup.error.message || String(cleanup.error)
            });
          }
        }
        if (rollbackError) {
          this.logger?.error?.('channel.create.rollback_failed', {
            channelId: data?.id || null,
            message: rollbackError.message || String(rollbackError)
          });
          return Err(new Error('Не удалось назначить владельца канала, а сервер не подтвердил откат. Обратитесь к администратору.'));
        }
        return Err(new Error('Канал не создан: не удалось назначить владельца. Повторите попытку.'));
      }

      try { this.closeModal?.(); } catch { /* ignore */ }
      try { await this.reloadDirectory?.(); } catch { /* ignore */ }
      try { await this.reloadChannel?.(data.id); } catch { /* ignore */ }
      return Ok(data);
    });
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

  async join(channelId) {
    const user = this.#requireUser();
    if (!user.ok) return user;
    if (!channelId) return Err(new Error('Не указан канал.'));

    return this.exclusive(`channel-join:${channelId}`, async () => {
      const { error } = await this.client.rpc('rim_channel_join', { p_channel_id: channelId });
      if (error) return Err(error);
      await this.reloadDirectory();
      await this.reloadChannel(channelId);
      return Ok(true);
    });
  }

  async leave(channelId, { skipConfirm = false } = {}) {
    const user = this.#requireUser();
    if (!user.ok) return user;
    if (!channelId) return Err(new Error('Не указан канал.'));
    if (!skipConfirm && !this.confirm('Отписаться от канала?')) return Ok({ cancelled: true });

    return this.exclusive(`channel-leave:${channelId}`, async () => {
      const { error } = await this.client.rpc('rim_channel_leave', { p_channel_id: channelId });
      if (error) return Err(error);
      await this.reloadDirectory();
      await this.reloadChannel(channelId);
      return Ok(true);
    });
  }

  async moderate(channelId, userId, action, {
    skipPrompts = false,
    durationHours = null,
    reason = ''
  } = {}) {
    const user = this.#requireUser();
    if (!user.ok) return user;
    if (!channelId || !userId) return Err(new Error('Не указан канал или пользователь.'));
    const normalized = String(action || '').toLowerCase();
    if (!['mute', 'kick', 'ban'].includes(normalized)) {
      return Err(new Error('Неизвестное действие модерации.'));
    }

    let hours = durationHours;
    let reasonText = reason;

    if (!skipPrompts) {
      if (normalized === 'mute') {
        const raw = this.prompt('Срок мута в часах (1–8760):', '24');
        if (raw === null) return Ok({ cancelled: true });
        hours = Number(raw);
        if (!Number.isInteger(hours) || hours < 1 || hours > 8760) {
          return Err(new Error('Укажите целое число часов от 1 до 8760.'));
        }
      } else if (!this.confirm(normalized === 'ban' ? 'Заблокировать пользователя?' : 'Удалить пользователя из подписчиков?')) {
        return Ok({ cancelled: true });
      }
      const reasonRaw = this.prompt('Причина (необязательно):', '');
      if (reasonRaw === null) return Ok({ cancelled: true });
      reasonText = reasonRaw || '';
    }

    return this.exclusive(`channel-mod:${channelId}:${userId}:${normalized}`, async () => {
      const { error } = await this.client.rpc('rim_channel_moderate_member', {
        p_channel_id: channelId,
        p_user_id: userId,
        p_action: normalized,
        p_reason: reasonText || '',
        p_duration_hours: normalized === 'mute' ? hours : null
      });
      if (error) return Err(error);
      await this.reopenSettings();
      return Ok(true);
    });
  }

  async unrestrict(channelId, userId, action) {
    const user = this.#requireUser();
    if (!user.ok) return user;
    if (!channelId || !userId) return Err(new Error('Не указан канал или пользователь.'));
    const normalized = String(action || '').toLowerCase();
    if (!['unmute', 'unban'].includes(normalized)) {
      return Err(new Error('Неизвестное действие снятия ограничения.'));
    }

    return this.exclusive(`channel-unrestrict:${channelId}:${userId}:${normalized}`, async () => {
      const { error } = await this.client.rpc('rim_channel_moderate_member', {
        p_channel_id: channelId,
        p_user_id: userId,
        p_action: normalized,
        p_reason: null,
        p_duration_hours: null
      });
      if (error) return Err(error);
      await this.reopenSettings();
      return Ok(true);
    });
  }

  async saveSettings(form = {}) {
    const user = this.#requireUser();
    if (!user.ok) return user;
    const channel = this.getChannel?.() || null;
    if (!channel?.id) return Err(new Error('Канал не выбран.'));

    const title = String(form.title ?? '').trim();
    const username = String(form.username ?? '').trim().toLowerCase();
    const description = String(form.description ?? '').trim();
    const isPublic = form.isPublic === true || form.isPublic === 'true';
    const discussion = form.discussionConversationId || null;

    if (!title) return Err(new Error('Название обязательно'));
    if (username && !/^[a-z0-9_]{3,24}$/.test(username)) {
      return Err(new Error('Username должен содержать 3–24 символа'));
    }

    return this.exclusive(`channel-save:${channel.id}`, async () => {
      const { data, error } = await this.client
        .from('channels')
        .update({
          title,
          description: description || '',
          username: username || null,
          is_public: isPublic
        })
        .eq('id', channel.id)
        .select('*')
        .single();
      if (error) return Err(error);

      const { error: groupError } = await this.client.rpc('rim_set_channel_discussion', {
        p_channel_id: channel.id,
        p_conversation_id: discussion
      });

      const next = { ...(data || {}), discussion_conversation_id: discussion };
      this.setChannel?.(next);

      if (groupError) {
        return Ok({
          channel: next,
          warning: 'Настройки сохранены, но группа не привязана: ' + (groupError.message || groupError)
        });
      }

      await this.reloadChannel(channel.id);
      return Ok({ channel: next });
    });
  }

  async changeAvatar(file) {
    const user = this.#requireUser();
    if (!user.ok) return user;
    const channel = this.getChannel?.() || null;
    if (!channel?.id) return Err(new Error('Канал не выбран.'));
    if (!file) return Err(new Error('Файл не выбран.'));

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type) || file.size > 3 * 1024 * 1024) {
      return Err(new Error('Выберите JPG, PNG, WEBP или GIF до 3 МБ.'));
    }

    return this.exclusive(`channel-avatar:${channel.id}`, async () => {
      const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${user.value.id}/channels/${channel.id}/${crypto.randomUUID()}.${ext}`;
      const { error: up } = await this.client.storage.from('avatars').upload(path, file, {
        contentType: file.type,
        upsert: false
      });
      if (up) return Err(up);

      const { error } = await this.client.from('channels').update({ avatar_path: path }).eq('id', channel.id);
      if (error) {
        try { await this.client.storage.from('avatars').remove([path]); } catch { /* ignore */ }
        return Err(error);
      }

      const next = { ...channel, avatar_path: path };
      this.setChannel?.(next);
      await this.reloadChannel(channel.id);
      return Ok(next);
    });
  }

  async createInvite({ maxUses = null, days = null } = {}) {
    const user = this.#requireUser();
    if (!user.ok) return user;
    const channel = this.getChannel?.() || null;
    if (!channel?.id) return Err(new Error('Канал не выбран.'));

    let max = maxUses;
    let dayCount = days;
    if (max === undefined || max === null) {
      const maxRaw = this.prompt('Лимит использований (пусто — без лимита):', '');
      if (maxRaw === null) return Ok({ cancelled: true });
      max = maxRaw.trim() ? Number(maxRaw) : null;
    }
    if (max !== null && (!Number.isInteger(max) || max < 1 || max > 100000)) {
      return Err(new Error('Введите целое число от 1 до 100000.'));
    }
    if (dayCount === undefined || dayCount === null) {
      const daysRaw = this.prompt('Срок действия в днях (пусто — без срока):', '');
      if (daysRaw === null) return Ok({ cancelled: true });
      dayCount = daysRaw.trim() ? Number(daysRaw) : null;
    }
    if (dayCount !== null && (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > 3650)) {
      return Err(new Error('Срок должен быть от 1 до 3650 дней.'));
    }

    const expires = dayCount ? new Date(Date.now() + dayCount * 86400000).toISOString() : null;
    return this.exclusive(`channel-invite:${channel.id}`, async () => {
      const { data, error } = await this.client.rpc('rim_channel_create_invite', {
        p_channel_id: channel.id,
        p_max_uses: max,
        p_expires_at: expires
      });
      if (error) return Err(error);
      const item = Array.isArray(data) ? data[0] : data;
      if (!item) return Err(new Error('Сервер не вернул код приглашения.'));
      return Ok(item);
    });
  }

  async revokeInvite(inviteId, { skipConfirm = false } = {}) {
    const user = this.#requireUser();
    if (!user.ok) return user;
    if (!inviteId) return Err(new Error('Не указано приглашение.'));
    if (!skipConfirm && !this.confirm('Отозвать приглашение?')) return Ok({ cancelled: true });

    return this.exclusive(`channel-invite-revoke:${inviteId}`, async () => {
      const { error } = await this.client.rpc('rim_channel_revoke_invite', { p_invite_id: inviteId });
      if (error) return Err(error);
      await this.reopenSettings();
      return Ok(true);
    });
  }

  async joinByInvite(code) {
    const user = this.#requireUser();
    if (!user.ok) return user;
    const value = String(code ?? '').trim();
    if (!value) return Ok({ cancelled: true });

    return this.exclusive(`channel-invite-join:${value}`, async () => {
      const { data, error } = await this.client.rpc('rim_channel_join_invite', { p_code: value });
      if (error) return Err(error);
      await this.reloadDirectory();
      if (data) await this.reloadChannel(data);
      return Ok(data);
    });
  }

  async setMemberRoleByUsername({ username, role } = {}) {
    const user = this.#requireUser();
    if (!user.ok) return user;
    const channel = this.getChannel?.() || null;
    if (!channel?.id) return Err(new Error('Канал не выбран.'));
    const name = String(username ?? '').trim().replace(/^@/, '');
    if (!name) return Err(new Error('Введите username участника.'));
    const normalizedRole = String(role ?? '').trim();
    if (!normalizedRole) return Err(new Error('Не указана роль.'));

    return this.exclusive(`channel-role:${channel.id}:${name}`, async () => {
      const { data: profile, error: profileError } = await this.client
        .from('profiles')
        .select('id,username')
        .eq('username', name)
        .maybeSingle();
      if (profileError) return Err(profileError);
      if (!profile) return Err(new Error('Пользователь не найден.'));

      const { data: changed, error } = await this.client.rpc('rim_channel_set_member_role', {
        p_channel_id: channel.id,
        p_user_id: profile.id,
        p_role: normalizedRole
      });
      if (error) return Err(error);
      if (!changed) return Err(new Error('Этот пользователь не состоит в канале.'));
      await this.reopenSettings();
      return Ok(true);
    });
  }
}
