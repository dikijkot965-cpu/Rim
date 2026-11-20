function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

/**
 * Renders the existing group-settings modal markup using a read-only projection.
 * Mutation commands remain owned by the legacy window entrypoints and are
 * invoked through data attributes + delegated handlers (no inline ID injection).
 */
export function renderGroupSettingsModal(projection, currentUserId) {
  const { group, members, profileById, isCreator } = projection;
  const id = escapeHtml(group.id);
  const title = escapeHtml(group.title || '');
  const description = escapeHtml(group.description || '');
  const isPrivate = group.is_private !== false;
  const inviteCode = group.invite_code ? escapeHtml(group.invite_code) : '';

  const memberRows = (members || []).map(member => {
    const memberId = String(member.user_id);
    const profile = profileById[memberId] || {};
    const displayName = escapeHtml(profile.display_name || profile.username || 'Участник');
    const username = escapeHtml(profile.username || '—');
    const role = escapeHtml(member.role || 'member');
    const isOwner = member.role === 'owner';

    const roleControls = isOwner
      ? ''
      : `<div class="row">
          <select class="field" id="rimGroupRole-${escapeHtml(memberId)}" data-rim-group-role-select="${escapeHtml(memberId)}">
            <option value="member" ${member.role === 'member' ? 'selected' : ''}>Участник</option>
            <option value="admin" ${member.role === 'admin' ? 'selected' : ''}>Администратор</option>
          </select>
          <button class="action-btn" type="button" data-rim-group-action="set-role" data-group-id="${id}" data-user-id="${escapeHtml(memberId)}">Роль</button>
          <button class="action-btn danger-btn" type="button" data-rim-group-action="remove-member" data-group-id="${id}" data-user-id="${escapeHtml(memberId)}">Удалить</button>
        </div>`;

    return `<div class="rim-group-member">
      <div>
        <b>${displayName}</b>
        <div class="rim-update-muted">@${username} · ${role}</div>
      </div>
      ${roleControls}
    </div>`;
  }).join('');

  const inviteBlock = inviteCode
    ? `<button class="action-btn" type="button" data-rim-group-action="copy-invite" data-invite-code="${inviteCode}">Копировать код</button>
       <button class="action-btn danger-btn" type="button" data-rim-group-action="revoke-invite" data-group-id="${id}">Отозвать ссылку</button>`
    : '';

  const inviteStatus = inviteCode
    ? `Код приглашения: ${inviteCode}`
    : 'Ссылка приглашения пока не создана.';

  const transferButton = isCreator
    ? `<button class="action-btn" type="button" style="width:100%;margin-top:10px" data-rim-group-action="transfer-owner" data-group-id="${id}">Передать владение</button>`
    : '';

  return `<div style="max-height:78vh;overflow:auto" data-rim-group-settings="${id}">
    <h2 class="modal-title">Настройки группы</h2>
    <label>Название</label>
    <input id="rimGroupTitle" class="field" maxlength="100" value="${title}"/>
    <label>Описание</label>
    <textarea id="rimGroupDesc" class="field" rows="3" maxlength="1000">${description}</textarea>
    <label class="settings-row"><span>Закрытая группа</span>
      <input id="rimGroupPrivate" type="checkbox" ${isPrivate ? 'checked' : ''}>
    </label>
    <div class="row" style="flex-wrap:wrap">
      <button class="primary-btn" type="button" data-rim-group-action="save" data-group-id="${id}">Сохранить</button>
      <button class="action-btn" type="button" data-rim-group-action="pick-avatar" data-group-id="${id}">Аватар</button>
      <input id="rimGroupAvatarFile" type="file" accept="image/jpeg,image/png,image/webp" hidden data-rim-group-action="upload-avatar" data-group-id="${id}">
    </div>
    <div class="row" style="flex-wrap:wrap;margin:10px 0">
      <button class="action-btn" type="button" data-rim-group-action="make-invite" data-group-id="${id}">Создать ссылку-приглашение</button>
      ${inviteBlock}
    </div>
    <div class="rim-update-muted">${inviteStatus}</div>
    <h3>Добавить участника</h3>
    <div class="rim-search-panel">
      <input id="rimGroupAddUsername" class="field" placeholder="@username">
      <button class="action-btn" type="button" data-rim-group-action="add-member" data-group-id="${id}">Добавить</button>
    </div>
    <h3>Участники · ${members.length}</h3>
    ${memberRows}
    ${transferButton}
    <button class="action-btn danger-btn" type="button" style="width:100%;margin-top:8px" data-rim-group-action="leave" data-group-id="${id}">Покинуть группу</button>
  </div>`;
}

/** Owns the group-settings read model and modal rendering. */
export class GroupSettingsController {
  constructor({
    repository,
    getUser,
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    logger = null,
    showModal = null,
    notify = null
  } = {}) {
    this.repository = repository;
    this.getUser = getUser;
    this.document = documentRef;
    this.window = windowRef;
    this.logger = logger;
    this.showModal = showModal || ((html) => this.window?.showModal?.(html));
    this.notify = notify || ((message) => {
      const fn = this.window?.toast || this.window?.notify || this.window?.notifyMsg;
      if (typeof fn === 'function') fn(String(message ?? 'Неизвестная ошибка'));
      else console.info(String(message ?? 'Неизвестная ошибка'));
    });
    this.requestSequence = 0;
    this.modalClickHandler = this.#onModalClick.bind(this);
    this.modalChangeHandler = this.#onModalChange.bind(this);
    this.boundRoot = null;
  }

  #say(message) {
    this.notify(message);
  }

  #onModalClick(event) {
    const actionEl = event.target?.closest?.('[data-rim-group-action]');
    if (!actionEl || !this.boundRoot?.contains?.(actionEl)) return;

    const action = actionEl.dataset.rimGroupAction;
    const groupId = actionEl.dataset.groupId;
    const userId = actionEl.dataset.userId;
    const inviteCode = actionEl.dataset.inviteCode;

    // File input change is handled separately.
    if (action === 'upload-avatar') return;

    switch (action) {
      case 'save':
        this.window?.rimSaveGroupSettings?.(groupId);
        break;
      case 'pick-avatar':
        this.document?.getElementById?.('rimGroupAvatarFile')?.click();
        break;
      case 'make-invite':
        this.window?.rimGroupMakeInvite?.(groupId);
        break;
      case 'copy-invite':
        this.window?.rimCopyGroupInvite?.(inviteCode);
        break;
      case 'revoke-invite':
        this.window?.rimGroupRevokeInvite?.(groupId);
        break;
      case 'add-member':
        this.window?.rimGroupAddMember?.(groupId);
        break;
      case 'set-role':
        this.window?.rimGroupSetRole?.(groupId, userId);
        break;
      case 'remove-member':
        this.window?.rimGroupRemoveMember?.(groupId, userId);
        break;
      case 'transfer-owner':
        this.window?.rimGroupTransferOwner?.(groupId);
        break;
      case 'leave':
        this.window?.rimGroupLeave?.(groupId);
        break;
      default:
        break;
    }
  }

  #onModalChange(event) {
    const input = event.target;
    if (!input || input.id !== 'rimGroupAvatarFile') return;
    if (!this.boundRoot?.contains?.(input)) return;
    const groupId = input.dataset.groupId;
    if (groupId) this.window?.rimUploadGroupAvatar?.(groupId);
  }

  #bindModalRoot(root) {
    if (this.boundRoot === root) return;
    this.boundRoot?.removeEventListener?.('click', this.modalClickHandler);
    this.boundRoot?.removeEventListener?.('change', this.modalChangeHandler);
    this.boundRoot = root;
    this.boundRoot?.addEventListener?.('click', this.modalClickHandler);
    this.boundRoot?.addEventListener?.('change', this.modalChangeHandler);
  }

  /**
   * Loads group settings and opens the existing modal UI.
   * @param {string} conversationId
   */
  async open(conversationId) {
    const user = this.getUser?.();
    const chats = this.window?.conversations || (typeof this.window?.CHATS === 'function' ? this.window.CHATS() : []);
    const chat = Array.isArray(chats) ? chats.find(item => String(item.id) === String(conversationId)) : null;

    if (!user?.id) {
      this.#say('Не удалось определить пользователя.');
      return null;
    }
    if (!chat || chat.type !== 'group') {
      this.#say('Группа не найдена.');
      return null;
    }

    const sequence = ++this.requestSequence;

    try {
      const result = await this.repository.getSettingsProjection(conversationId, user.id);
      if (sequence !== this.requestSequence) return null;
      if (!result.ok) throw result.error;

      const projection = result.value;
      if (!projection.isManager) {
        this.#say('Настройки доступны владельцу и администраторам группы.');
        return null;
      }

      const html = renderGroupSettingsModal(projection, user.id);
      this.showModal(html);

      // Bind after the modal is in the DOM. showModal implementations vary;
      // we locate the root by data attribute. Avoid CSS.escape — it is not
      // available in all runtimes (Node tests, older WebViews).
      const safeId = String(conversationId).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const root = this.document?.querySelector?.(`[data-rim-group-settings="${safeId}"]`)
        || this.document?.querySelector?.('[data-rim-group-settings]');
      if (root) this.#bindModalRoot(root);

      return projection;
    } catch (error) {
      if (sequence !== this.requestSequence) return null;
      this.logger?.warn?.('groups.settings.open.failed', { message: error?.message, conversationId });
      this.#say(error?.message || error?.error_description || 'Не удалось открыть настройки группы.');
      return null;
    }
  }

  invalidate() {
    this.requestSequence += 1;
  }

  dispose() {
    this.invalidate();
    this.boundRoot?.removeEventListener?.('click', this.modalClickHandler);
    this.boundRoot?.removeEventListener?.('change', this.modalChangeHandler);
    this.boundRoot = null;
  }
}
