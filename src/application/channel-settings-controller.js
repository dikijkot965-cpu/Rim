function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function formatWhen(value) {
  if (!value) return 'без срока';
  try {
    return 'до ' + new Date(value).toLocaleString('ru-RU');
  } catch {
    return 'без срока';
  }
}

export function renderChannelSettingsShell(channel) {
  const id = escapeHtml(channel.id);
  const e2eControls = channel.is_public === false
    ? `<div class="rim-update-muted" style="margin:12px 0">E2E: ${channel.e2e_mode === 'required' ? 'обязательное шифрование' : channel.e2e_mode === 'pending' ? 'ожидает завершения настройки' : 'выключено'}</div>
       <div class="rim-channel-toolbar">
         <button class="action-btn" type="button" data-rim-cs-action="enable-e2e">${channel.e2e_mode === 'required' ? 'Проверить E2E' : 'Включить E2E'}</button>
         ${['pending','required'].includes(channel.e2e_mode) ? '<button class="action-btn danger-btn" type="button" data-rim-cs-action="disable-e2e">Отключить E2E</button>' : ''}
       </div>`
    : '';
  return `<div class="rim-channel-settings" data-channel-settings="${id}">
    <h2 class="modal-title">Настройки канала</h2>
    <div class="rim-channel-toolbar">
      <button class="action-btn" type="button" data-rim-cs-action="pick-avatar">🖼 Изменить аватар</button>
      <input id="rimChannelAvatarFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden data-rim-cs-action="upload-avatar">
    </div>
    <label>Название</label>
    <input id="rimChTitle" class="field" maxlength="80" value="${escapeHtml(channel.title || '')}">
    <label>Описание</label>
    <textarea id="rimChDesc" class="field" rows="3">${escapeHtml(channel.description || '')}</textarea>
    <label>Username (латиница, цифры, _)</label>
    <input id="rimChUsername" class="field" maxlength="24" value="${escapeHtml(channel.username || '')}">
    <label>Доступ</label>
    <select id="rimChPublic" class="field">
      <option value="true" ${channel.is_public ? 'selected' : ''}>Публичный</option>
      <option value="false" ${!channel.is_public ? 'selected' : ''}>Закрытый</option>
    </select>
    <label>Группа обсуждения</label>
    <select id="rimChGroup" class="field" disabled><option value="">Загрузка групп…</option></select>
    <p class="feature-small">Группу можно привязать только здесь, в настройках канала. Подписчики синхронизируются с группой.</p>
    <div class="rim-channel-toolbar">
      <button class="primary-btn" type="button" data-rim-cs-action="save">Сохранить</button>
    </div>
    ${e2eControls}
    <h3>Подписчики и модерация</h3>
    <div id="rimChannelSettingsMembers" class="feature-small" role="status">Загружаем подписчиков…</div>
    <h3>Активные ограничения</h3>
    <div id="rimChannelSettingsModeration" class="feature-small" role="status">Загружаем ограничения…</div>
    <p class="feature-small">Мут запрещает комментарии до истечения срока; кик снимает подписку; бан блокирует повторную подписку.</p>
  </div>`;
}

export function renderChannelMembers(members, channel) {
  if (!members?.length) return '<p class="feature-small">Подписчиков нет.</p>';
  return members.map(member => {
    const profile = member.profile || {};
    const name = escapeHtml(profile.display_name || profile.username || 'Участник');
    const username = escapeHtml(profile.username || '—');
    const role = escapeHtml(member.role || 'member');
    const isOwner = String(member.user_id) === String(channel.owner_id);
    const actions = isOwner
      ? ''
      : `<div class="rim-channel-member-actions">
          <button class="action-btn" type="button" data-rim-cs-action="moderate" data-channel-id="${escapeHtml(channel.id)}" data-user-id="${escapeHtml(member.user_id)}" data-mod-action="mute">Мут</button>
          <button class="action-btn" type="button" data-rim-cs-action="moderate" data-channel-id="${escapeHtml(channel.id)}" data-user-id="${escapeHtml(member.user_id)}" data-mod-action="kick">Кик</button>
          <button class="action-btn danger-btn" type="button" data-rim-cs-action="moderate" data-channel-id="${escapeHtml(channel.id)}" data-user-id="${escapeHtml(member.user_id)}" data-mod-action="ban">Бан</button>
        </div>`;
    return `<div class="rim-channel-member"><div><b>${name}</b><div class="feature-small">@${username} · ${role}</div></div>${actions}</div>`;
  }).join('');
}

export function renderChannelModeration(rows, channelId, error) {
  if (error) return `<div class="notice">${escapeHtml(error.message || error)}</div>`;
  if (!rows?.length) return '<p class="feature-small">Активных ограничений нет.</p>';
  return rows.map(row => {
    const label = row.action === 'ban' ? 'Заблокирован' : 'Ограничен в комментариях';
    const undo = row.action === 'ban' ? 'unban' : 'unmute';
    return `<div class="rim-channel-member">
      <div><b>${escapeHtml(label)}</b><div class="feature-small">${escapeHtml(row.user_id)} · ${formatWhen(row.expires_at)}</div></div>
      <button class="action-btn" type="button" data-rim-cs-action="unrestrict" data-channel-id="${escapeHtml(channelId)}" data-user-id="${escapeHtml(row.user_id)}" data-mod-action="${escapeHtml(undo)}">Снять</button>
    </div>`;
  }).join('');
}

export function renderGroupOptions(groups, selectedId, groupsError) {
  let html = '<option value="">Не привязана</option>';
  for (const group of groups || []) {
    const selected = String(group.id) === String(selectedId) ? 'selected' : '';
    html += `<option value="${escapeHtml(group.id)}" ${selected}>${escapeHtml(group.title || 'Группа')}</option>`;
  }
  if (groupsError) html += '<option disabled>Не удалось загрузить группы</option>';
  return html;
}

/** Owns channel-settings open/read/render. Mutations stay on legacy window commands. */
export class ChannelSettingsController {
  constructor({
    repository,
    getUser,
    getChannel,
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    logger = null,
    showModal = null,
    notify = null
  } = {}) {
    this.repository = repository;
    this.getUser = getUser;
    this.getChannel = getChannel || (() => this.window?.currentChannel || null);
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
    this.clickHandler = this.#onClick.bind(this);
    this.changeHandler = this.#onChange.bind(this);
    this.boundRoot = null;
  }

  #say(message) {
    this.notify(message);
  }

  #bindRoot(root) {
    if (this.boundRoot === root) return;
    this.boundRoot?.removeEventListener?.('click', this.clickHandler);
    this.boundRoot?.removeEventListener?.('change', this.changeHandler);
    this.boundRoot = root;
    this.boundRoot?.addEventListener?.('click', this.clickHandler);
    this.boundRoot?.addEventListener?.('change', this.changeHandler);
  }

  #onClick(event) {
    const el = event.target?.closest?.('[data-rim-cs-action]');
    if (!el || !this.boundRoot?.contains?.(el)) return;
    const action = el.dataset.rimCsAction;
    if (action === 'upload-avatar') return;

    switch (action) {
      case 'pick-avatar':
        this.document?.getElementById?.('rimChannelAvatarFile')?.click();
        break;
      case 'save':
        this.window?.rimSaveChannelSettings?.();
        break;
      case 'moderate':
        this.window?.rimModerateChannel?.(el.dataset.channelId, el.dataset.userId, el.dataset.modAction);
        break;
      case 'enable-e2e':
        this.window?.rimEnableE2EScope?.('private_channel', this.getChannel?.()?.id);
        break;
      case 'disable-e2e':
        this.window?.rimDisableE2EScope?.('private_channel', this.getChannel?.()?.id);
        break;
      case 'unrestrict':
        this.window?.rimChannelUnrestrict?.(el.dataset.channelId, el.dataset.userId, el.dataset.modAction);
        break;
      default:
        break;
    }
  }

  #onChange(event) {
    const input = event.target;
    if (!input || input.id !== 'rimChannelAvatarFile') return;
    if (!this.boundRoot?.contains?.(input)) return;
    const file = input.files?.[0];
    if (file) this.window?.rimChangeChannelAvatar?.(file);
  }

  async #resolveChannel() {
    let channel = this.getChannel?.();
    if (channel?.id) return channel;

    const id =
      this.window?.__rimCurrentChannelId ||
      this.document?.getElementById?.('rimChannelFull')?.dataset?.channelId ||
      null;
    if (!id || !this.repository?.client) return null;

    try {
      const { data, error } = await this.repository.client
        .from('channels')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        this.window.currentChannel = data;
        try { this.window.__rimCurrentChannelId = data.id; } catch { /* ignore */ }
        return data;
      }
    } catch (error) {
      this.logger?.warn?.('channels.settings.resolve.failed', { message: error?.message });
    }
    return null;
  }

  async open() {
    const user = this.getUser?.();
    const channel = await this.#resolveChannel();
    if (!user?.id) {
      this.#say('Требуется вход в РИМ.');
      return null;
    }
    if (!channel?.id) {
      this.#say('Канал не выбран. Откройте канал и нажмите ⚙ снова.');
      return null;
    }

    const sequence = ++this.requestSequence;

    try {
      const manageResult = await this.repository.canManage(channel, user.id);
      if (sequence !== this.requestSequence) return null;
      if (!manageResult.ok) throw manageResult.error;
      if (!manageResult.value) {
        this.#say('Настройки доступны администраторам канала');
        return null;
      }

      const html = renderChannelSettingsShell(channel);
      this.showModal(html);

      const safeId = String(channel.id).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const root = this.document?.querySelector?.(`.rim-channel-settings[data-channel-settings="${safeId}"]`)
        || this.document?.querySelector?.('.rim-channel-settings');
      if (root) this.#bindRoot(root);

      // Ancillary hydration after shell is visible — same contract as legacy.
      const ancillary = await this.repository.getAncillary(channel.id);
      if (sequence !== this.requestSequence) return null;
      if (!ancillary.ok) throw ancillary.error;

      const current = this.getChannel?.();
      if (!root || String(current?.id) !== String(channel.id)) return ancillary.value;

      const groupSelect = root.querySelector?.('#rimChGroup');
      if (groupSelect) {
        groupSelect.innerHTML = renderGroupOptions(
          ancillary.value.groups,
          channel.discussion_conversation_id,
          ancillary.value.groupsError
        );
        groupSelect.disabled = false;
      }

      const memberOut = root.querySelector?.('#rimChannelSettingsMembers');
      if (memberOut) memberOut.innerHTML = renderChannelMembers(ancillary.value.members, channel);

      const modOut = root.querySelector?.('#rimChannelSettingsModeration');
      if (modOut) {
        modOut.innerHTML = renderChannelModeration(
          ancillary.value.moderation,
          channel.id,
          ancillary.value.moderationError
        );
      }

      return { channel, ...ancillary.value };
    } catch (error) {
      if (sequence !== this.requestSequence) return null;
      this.logger?.warn?.('channels.settings.open.failed', { message: error?.message });
      this.#say(error?.message || 'Не удалось открыть настройки канала.');
      return null;
    }
  }

  invalidate() {
    this.requestSequence += 1;
  }

  dispose() {
    this.invalidate();
    this.boundRoot?.removeEventListener?.('click', this.clickHandler);
    this.boundRoot?.removeEventListener?.('change', this.changeHandler);
    this.boundRoot = null;
  }
}
