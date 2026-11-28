/**
 * Composition root fragment: groups surface.
 * Binds group settings controller and group command window routes.
 * groupRepository must already be registered on the container.
 */
import { GroupSettingsController } from '../application/group-settings-controller.js';
import { GroupCommandService } from '../application/group-command-service.js';
import { ZladenGroupConsoleController } from '../application/zladen-group-console-controller.js';

function reportGroupCommand(result, { notify, logger } = {}) {
  if (!result) return result;
  if (!result.ok) {
    const message = result.error?.message || result.error || 'Операция группы не выполнена.';
    notify?.(String(message));
    logger?.warn?.('group.command.failed', { message: String(message) });
  }
  return result;
}

/**
 * @param {object} deps
 */
export function bindGroupsSurface({
  client,
  getUser,
  getConversations,
  notify,
  logger,
  container,
  lifecycle,
  documentRef = globalThis.document,
  windowRef = globalThis.window
} = {}) {
  const win = windowRef;
  const doc = documentRef;

  const groupSettings = new GroupSettingsController({
    repository: container.get('groupRepository'),
    getUser,
    documentRef: doc,
    windowRef: win,
    logger,
    notify
  });
  container.value('groupSettings', groupSettings);
  win.__RIM_GROUP_SETTINGS_OWNED = true;
  win.rimOpenGroupSettings = id => groupSettings.open(id);
  const zladenConsole = new ZladenGroupConsoleController({
    client,
    getUser,
    zladenService: container.get('zladenBot'),
    notify,
    documentRef: doc,
    windowRef: win,
    logger
  });
  container.value('zladenGroupConsole', zladenConsole);
  win.rimOpenZladenConsole = id => zladenConsole.open(id);
  lifecycle?.add?.(() => {
    win.__RIM_GROUP_SETTINGS_OWNED = false;
    win.rimOpenZladenConsole = undefined;
    win.newGroupChat = undefined;
    win.rimOpenGroupCreate = undefined;
    win.rimCreateGroup = undefined;
    groupSettings.dispose();
    zladenConsole.dispose();
  });

  const groupCommands = new GroupCommandService({
    client,
    getUser,
    getConversations,
    notify,
    closeModal: () => win.closeModal?.(),
    afterCreate: async id => { await win.loadConversations?.(); if (id) await win.openConversation?.(id); },
    reopenSettings: async id => { await win.rimOpenGroupSettings?.(id); },
    openConversation: async id => { await win.openConversation?.(id); },
    reloadConversations: async () => { await win.loadConversations?.(); },
    logger
  });
  container.value('groupCommands', groupCommands);
  win.__RIM_GROUP_COMMANDS_OWNED = true;

  const report = result => reportGroupCommand(result, { notify, logger });

  win.rimCreateGroup = async () => {
    const names = (doc.getElementById('rimGroupMembers')?.value || '')
      .split(',')
      .map(part => part.trim())
      .filter(Boolean);
    let zladenAddedToInviteList = false;
    if (doc.getElementById('rimGroupAddZladen')?.checked) {
      try {
        const profile = await container.get('zladenBot')?.getPublicProfile?.();
        if (profile?.ok && profile.value?.username) {
          names.push(profile.value.username);
          zladenAddedToInviteList = true;
        }
      } catch (error) {
        logger?.warn?.('group.create.zladen_profile_failed', { message: error?.message || String(error) });
      }
    }
    const result = report(await groupCommands.create({
      title: doc.getElementById('rimGroupTitle')?.value,
      memberUsernames: names,
      isPublic: !!doc.getElementById('rimGroupPublic')?.checked,
      avatarFile: doc.getElementById('rimGroupAvatar')?.files?.[0] || null
    }));
    if (result?.ok) {
      notify?.(zladenAddedToInviteList ? 'Группа создана, Злыдя добавлен.' : 'Группа создана.');
      if (doc.getElementById('rimGroupAddZladen')?.checked && !zladenAddedToInviteList) {
        notify?.('Не удалось автоматически добавить Злыдю. Его можно добавить через информацию о группе.');
      }
    }
    return result;
  };

  // Public entrypoint used by the floating + menu.
  const openGroupCreate = () => {
    if (typeof win.showModal !== 'function') { notify?.('Не удалось открыть форму создания группы: модуль окон не загружен.'); return false; }
    win.showModal(`<h2 class="modal-title">Создать группу</h2>
      <label class="field-label" for="rimGroupTitle">Название группы</label>
      <input class="field" id="rimGroupTitle" maxlength="60" placeholder="Например, Совет директоров" required>
      <label class="field-label" for="rimGroupMembers">Участники по username (через запятую, необязательно)</label>
      <input class="field" id="rimGroupMembers" placeholder="username1, username2">
      <label class="field-label" for="rimGroupAvatar">Аватар группы</label>
      <input class="field" id="rimGroupAvatar" type="file" accept="image/jpeg,image/png,image/webp,image/gif">
      <div class="rim-settings-line"><div><b>Добавить Злыдю</b><small>Бот сможет отвечать на команды и управлять игровыми функциями.</small></div>
      <input class="rim-switch" id="rimGroupAddZladen" type="checkbox" checked></div>
      <div class="rim-settings-line"><div><b>Публичная группа</b><small>Её можно будет найти в каталоге.</small></div>
      <input class="rim-switch" id="rimGroupPublic" type="checkbox"></div>
      <div class="modal-actions"><button class="action-btn" type="button" onclick="closeModal()">Отмена</button>
      <button class="primary-btn" type="button" onclick="rimCreateGroup()">Создать группу</button></div>`);
    return true;
  };
  win.rimOpenGroupCreate = openGroupCreate;
  win.newGroupChat = openGroupCreate;

  win.rimJoinPublicGroup = async id => {
    const result = report(await groupCommands.joinPublic(id));
    if (result?.ok) notify?.('Вы вступили в группу.');
    return result;
  };

  win.rimSaveGroupSettings = async id => {
    const result = report(await groupCommands.saveSettings(id, {
      title: doc.getElementById('rimGroupTitle')?.value,
      description: doc.getElementById('rimGroupDesc')?.value || '',
      isPrivate: doc.getElementById('rimGroupPrivate')?.checked !== false
    }));
    if (result?.ok) notify?.('Настройки группы сохранены.');
    return result;
  };

  win.rimGroupAddMember = async (id, username = null) => {
    const result = report(await groupCommands.addMember(id, username ?? doc.getElementById('rimGroupAddUsername')?.value));
    if (result?.ok) notify?.('Участник добавлен.');
    return result;
  };

  win.rimGroupAddZladen = async id => {
    const zladen = container.get('zladenBot');
    if (!zladen?.getPublicProfile) {
      notify?.('Не удалось получить профиль Злыди.');
      return null;
    }
    const profile = await zladen.getPublicProfile();
    if (!profile?.ok || !profile.value?.username) {
      notify?.(profile?.error?.message || 'Профиль Злыди пока недоступен.');
      return profile;
    }
    const result = report(await groupCommands.addMember(id, profile.value.username));
    if (result?.ok) notify?.('Злыдя добавлен в группу. Он представится первым сообщением.');
    return result;
  };

  win.rimGroupRemoveMember = async (id, userId) => report(await groupCommands.removeMember(id, userId));

  win.rimGroupSetRole = async (id, userId) => {
    const role = doc.getElementById('rimGroupRole-' + userId)?.value;
    return report(await groupCommands.setRole(id, userId, role));
  };

  win.rimGroupLeave = async id => report(await groupCommands.leave(id));

  win.rimUploadGroupAvatar = async id => {
    const file = doc.getElementById('rimGroupAvatarFile')?.files?.[0];
    return report(await groupCommands.uploadAvatar(id, file));
  };

  win.rimGroupMakeInvite = async id => {
    const result = report(await groupCommands.createInvite(id));
    if (result?.ok && result.value != null) {
      const code = result.value;
      try { await navigator.clipboard.writeText(String(code)); } catch { /* ignore */ }
      notify?.('Код приглашения создан: ' + code);
    }
    return result;
  };

  win.rimCopyGroupInvite = async code => {
    try {
      await navigator.clipboard.writeText(String(code));
      notify?.('Код приглашения скопирован.');
    } catch {
      notify?.('Код: ' + code);
    }
  };

  win.rimGroupRevokeInvite = async id => report(await groupCommands.revokeInvite(id));

  win.rimGroupTransferOwner = async id => {
    const username = win.prompt?.('Username нового владельца (он должен быть участником группы):');
    if (username === null || username === undefined) return;
    const result = report(await groupCommands.transferOwner(id, username));
    if (result?.ok && !result.value?.cancelled) notify?.('Владение передано.');
    return result;
  };

  win.rimJoinGroupByInvite = async () => {
    const code = win.prompt?.('Вставьте код приглашения в группу:');
    if (code === null || code === undefined) return;
    const result = report(await groupCommands.joinByInvite(code));
    if (result?.ok && !result.value?.cancelled) notify?.('Вы вступили в группу.');
    return result;
  };

  lifecycle?.add?.(() => { win.__RIM_GROUP_COMMANDS_OWNED = false; });
  logger?.info?.('composition.groupsSurface.bound', {});

  return { groupSettings, groupCommands };
}
