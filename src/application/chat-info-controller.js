import { Err, Ok } from '../core/result.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[ch]);
}

/**
 * Owns the chat-info modal: members list for the active conversation,
 * group add-member action, and the feature actions block (pinned + wallpaper).
 * Visual markup intentionally matches the legacy openChatInfo modal.
 */
export class ChatInfoController {
  constructor({
    client,
    getUser,
    getActiveConversation = () => null,
    getProfiles = null,
    conversationTitle = null,
    notify = () => {},
    showModal = null,
    windowRef = globalThis.window,
    logger = null
  } = {}) {
    this.client = client;
    this.getUser = getUser;
    this.getActiveConversation = getActiveConversation;
    this.getProfiles = getProfiles;
    this.conversationTitle = conversationTitle;
    this.notify = notify;
    this.showModal = showModal || ((html) => this.window?.showModal?.(html));
    this.window = windowRef;
    this.logger = logger;
  }

  #title(conversation) {
    if (typeof this.conversationTitle === 'function') {
      try {
        return this.conversationTitle(conversation) || 'Чат';
      } catch {
        /* fall through */
      }
    }
    return conversation?.title
      || (conversation?.type === 'direct' ? 'Личная переписка' : 'Групповая беседа')
      || 'Чат';
  }

  async #loadProfiles(userIds) {
    if (typeof this.getProfiles === 'function') {
      try {
        return (await this.getProfiles(userIds)) || {};
      } catch {
        /* fall through to direct query */
      }
    }
    if (!userIds?.length) return {};
    const { data, error } = await this.client
      .from('profiles')
      .select('id,username,display_name')
      .in('id', userIds);
    if (error) return {};
    const map = {};
    for (const row of data || []) map[row.id] = row;
    return map;
  }

  async open() {
    const conversation = this.getActiveConversation?.();
    if (!conversation?.id) return Err(new Error('Нет активного чата.'));

    const { data: members, error } = await this.client
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', conversation.id);

    if (error) {
      this.notify?.(error.message || 'Не удалось загрузить участников');
      return Err(error);
    }

    const profiles = await this.#loadProfiles((members || []).map(m => m.user_id));
    const title = escapeHtml(this.#title(conversation));
    const kind = conversation.type === 'group' ? 'Групповая беседа' : 'Личная переписка';
    const rows = (members || []).map(m => {
      const p = profiles[m.user_id] || {};
      const name = escapeHtml(p.display_name || p.username || 'Участник');
      const uname = escapeHtml(p.username || '—');
      const glyph = (p.display_name || p.username || '?').slice(0, 1).toUpperCase();
      return `<div class="rim-info-member">
        <div class="rim-info-avatar">${glyph}</div>
        <div class="rim-info-member-copy">
          <div class="rim-info-member-name">${name}</div>
          <div class="rim-info-member-user">@${uname}</div>
        </div>
      </div>`;
    }).join('') || '<div class="empty-state">Участники не найдены.</div>';

    const groupAction = conversation.type === 'group'
      ? `<button class="action-btn rim-info-btn" type="button" onclick="addGroupMember()">＋ Добавить участника</button>`
      : '';
    const currentUserId = String(this.getUser?.()?.id || '');
    const peerUserId = (members || []).map(member => String(member.user_id || '')).find(id => id && id !== currentUserId) || '';
    const e2eAction = conversation.type === 'group' && conversation.is_private === true
      ? `<button class="action-btn rim-info-btn rim-info-e2e" type="button" onclick="closeModal();rimEnableE2EScope('group','${escapeHtml(conversation.id)}')">${conversation.e2e_mode === 'required' ? '🔒 Проверить E2E' : conversation.e2e_mode === 'pending' ? '🔒 Завершить настройку E2E' : '🔒 Включить E2E'}</button>`
      : conversation.type === 'direct' && (conversation.is_secret === true || ['pending','required'].includes(conversation.e2e_mode))
        ? `<button class="action-btn rim-info-btn rim-info-e2e" type="button" onclick="closeModal();rimVerifyE2E()">🔒 Проверить зашифрованный обмен</button>`
        : conversation.type === 'direct' && peerUserId
          ? `<button class="action-btn rim-info-btn rim-info-e2e" type="button" onclick="closeModal();startSecretChatWith('${escapeHtml(peerUserId)}')">🔒 Создать отдельный секретный чат E2E</button>`
          : '';


    this.showModal(`
  <div class="rim-info-card">
    <div class="rim-info-hero">
      <div class="rim-info-hero-avatar">${conversation.type === 'group' ? '♧' : '⚜'}</div>
      <h2 class="rim-info-title">${title}</h2>
      <div class="rim-info-sub">${kind} · ${(members || []).length} уч.</div>
    </div>
    <div class="rim-info-section-label">Участники</div>
    <div class="rim-info-members">${rows}</div>
    <div class="rim-info-actions">
      <button class="action-btn rim-info-btn" type="button" onclick="openPinnedMessages();closeModal()">📌 Закреплённые</button>
      <button class="action-btn rim-info-btn" type="button" onclick="openPersonalWallpaper();closeModal()">🖼 Обои чата</button>
      ${e2eAction}
      ${groupAction}
      <button class="primary-btn rim-info-btn" type="button" onclick="closeModal()">Закрыть</button>
    </div>
  </div>
 `);

    this.logger?.info?.('chatInfo.opened', { conversationId: conversation.id, members: (members || []).length });
    return Ok({ conversationId: conversation.id, memberCount: (members || []).length });
  }

  async addGroupMember() {
    const conversation = this.getActiveConversation?.();
    if (!conversation?.id || conversation.type !== 'group') {
      return Err(new Error('Добавление доступно только в группе.'));
    }
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Требуется вход в РИМ.'));

    const raw = this.window?.prompt?.('Username нового участника:');
    if (raw === null) return Ok({ cancelled: true });
    const username = String(raw || '').trim().replace(/^@/, '');
    if (!username) return Ok({ cancelled: true });

    const { data: profile, error } = await this.client
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (error || !profile) {
      this.notify?.('Пользователь не найден.');
      return Err(error || new Error('Пользователь не найден.'));
    }

    const { error: addError } = await this.client
      .from('conversation_members')
      .insert({
        conversation_id: conversation.id,
        user_id: profile.id
      });

    if (addError) {
      this.notify?.('Не удалось добавить участника: ' + (addError.message || ''));
      return Err(addError);
    }

    this.notify?.('Участник добавлен.');
    await this.open();
    return Ok({ userId: profile.id });
  }
}
