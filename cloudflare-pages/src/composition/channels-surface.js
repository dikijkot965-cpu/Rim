/**
 * Composition root fragment: channels surface.
 * Binds directory, feed, settings controllers and channel command routes.
 * Repositories must already be registered on the container.
 */
import { ChannelDirectoryController } from '../application/channel-directory-controller.js';
import { ChannelFeedController } from '../application/channel-feed-controller.js';
import { ChannelSettingsController } from '../application/channel-settings-controller.js';
import { ChannelCommandService } from '../application/channel-command-service.js';

function reportChannelCommand(result, { notify, logger } = {}) {
  if (!result) return result;
  if (result.ok) {
    if (result.value?.cancelled) return result;
    return result;
  }
  const message = result.error?.message || result.error || 'Операция канала не выполнена.';
  notify?.(String(message));
  logger?.warn?.('channel.command.failed', { message: String(message) });
  return result;
}

/**
 * @param {object} deps
 */
export function bindChannelsSurface({
  client,
  getUser,
  notify,
  logger,
  container,
  lifecycle,
  documentRef = globalThis.document,
  windowRef = globalThis.window
} = {}) {
  const win = windowRef;
  const doc = documentRef;

  const channelDirectory = new ChannelDirectoryController({
    repository: container.get('channelRepository'),
    getUser,
    documentRef: doc,
    windowRef: win,
    logger
  });
  container.value('channelDirectory', channelDirectory);
  win.__RIM_CHANNEL_DIRECTORY_OWNED = true;
  win.loadChannels = () => channelDirectory.load();
  win.rimFilterChannels = mode => channelDirectory.setScope(mode);
  lifecycle?.add?.(() => {
    win.__RIM_CHANNEL_DIRECTORY_OWNED = false;
    channelDirectory.dispose();
  });

  const channelFeed = new ChannelFeedController({
    repository: container.get('channelFeedRepository'),
    getUser,
    documentRef: doc,
    windowRef: win,
    logger,
    notify
  });
  container.value('channelFeed', channelFeed);
  win.__RIM_CHANNEL_FEED_OWNED = true;
  win.openChannel = id => channelFeed.open(id);
  win.rimCloseChannelFull = () => channelFeed.close();
  win.rimLoadChannelComments = (button, postId) => channelFeed.loadComments(button, postId);
  win.rimPublishPost = () => channelFeed.publishFromComposer();
  win.publishChannelPost = () => channelFeed.publishFromComposer();
  win.rimReactChannelPost = (postId, emoji) => channelFeed.reactToPost(postId, emoji);
  win.reactToPost = (postId, emoji) => channelFeed.reactToPost(postId, emoji);
  lifecycle?.add?.(() => {
    win.__RIM_CHANNEL_FEED_OWNED = false;
    channelFeed.dispose();
  });

  const channelSettings = new ChannelSettingsController({
    repository: container.get('channelSettingsRepository'),
    getUser,
    getChannel: () => win.currentChannel || null,
    documentRef: doc,
    windowRef: win,
    logger,
    notify
  });
  container.value('channelSettings', channelSettings);
  win.__RIM_CHANNEL_SETTINGS_OWNED = true;
  win.rimOpenChannelSettings = () => channelSettings.open();
  lifecycle?.add?.(() => {
    win.__RIM_CHANNEL_SETTINGS_OWNED = false;
    channelSettings.dispose();
  });

  const channelCommands = new ChannelCommandService({
    client,
    getUser,
    notify,
    reloadDirectory: async () => { await win.loadChannels?.(); },
    reloadChannel: async id => { if (id && win.openChannel) await win.openChannel(id); },
    reopenSettings: async () => { await win.rimOpenChannelSettings?.(); },
    getChannel: () => win.currentChannel || null,
    setChannel: channel => {
      win.currentChannel = channel;
      try { globalThis.currentChannel = channel; } catch { /* ignore */ }
    },
    closeModal: () => win.closeModal?.(),
    logger
  });
  container.value('channelCommands', channelCommands);
  win.__RIM_CHANNEL_COMMANDS_OWNED = true;

  const report = result => reportChannelCommand(result, { notify, logger });

  win.rimCreateChannel = async () => {
    const result = report(await channelCommands.create({
      title: doc.getElementById('rimChannelTitle')?.value,
      description: doc.getElementById('rimChannelDesc')?.value,
      username: doc.getElementById('rimChannelUsername')?.value,
      isPublic: !!doc.getElementById('rimChannelPublic')?.checked,
      avatarFile: doc.getElementById('rimChannelAvatar')?.files?.[0] || null
    }));
    if (result?.ok) notify?.('Канал создан.');
    return result;
  };

  win.createChannel = () => {
    if (typeof win.showModal === 'function') {
      win.showModal(`<h2 class="modal-title">Создать канал</h2>
      <label class="field-label">Название</label><input class="field" id="rimChannelTitle" maxlength="80">
      <label class="field-label">Описание</label><textarea class="field" id="rimChannelDesc" rows="3"></textarea>
      <label class="field-label">Username (необязательно)</label><input class="field" id="rimChannelUsername" maxlength="24" placeholder="channel_name">
      <label class="field-label">Аватар канала</label><input class="field" id="rimChannelAvatar" type="file" accept="image/jpeg,image/png,image/webp,image/gif">
      <div class="rim-settings-line"><div><b>Публичный канал</b><small>Его можно будет найти в поиске.</small></div>
      <input class="rim-switch" id="rimChannelPublic" type="checkbox" checked></div>
      <div class="modal-actions"><button class="action-btn" onclick="closeModal()">Отмена</button>
      <button class="primary-btn" onclick="rimCreateChannel()">Создать</button></div>`);
    }
  };

  win.rimJoinChannel = async id => {
    const result = report(await channelCommands.join(id));
    if (result?.ok && !result.value?.cancelled) notify?.('Подписка оформлена');
    return result;
  };
  win.rimLeaveChannel = async id => {
    const result = report(await channelCommands.leave(id));
    if (result?.ok && !result.value?.cancelled) notify?.('Вы отписались');
    return result;
  };
  win.rimModerateChannel = async (channelId, userId, action) => {
    const result = report(await channelCommands.moderate(channelId, userId, action));
    if (result?.ok && !result.value?.cancelled) notify?.('Действие выполнено');
    return result;
  };
  win.rimChannelUnrestrict = async (channelId, userId, action) => {
    return report(await channelCommands.unrestrict(channelId, userId, action));
  };

  win.rimSaveChannelSettings = async () => {
    const form = {
      title: doc.getElementById('rimChTitle')?.value,
      description: doc.getElementById('rimChDesc')?.value,
      username: doc.getElementById('rimChUsername')?.value,
      isPublic: doc.getElementById('rimChPublic')?.value,
      discussionConversationId: doc.getElementById('rimChGroup')?.value || null
    };
    const result = report(await channelCommands.saveSettings(form));
    if (result?.ok) {
      if (result.value?.warning) notify?.(result.value.warning);
      else notify?.('Настройки канала сохранены');
    }
    return result;
  };
  win.rimChangeChannelAvatar = async file => {
    const result = report(await channelCommands.changeAvatar(file));
    if (result?.ok) notify?.('Аватар канала обновлён.');
    return result;
  };
  win.rimChannelCreateInvite = async () => {
    const result = report(await channelCommands.createInvite());
    if (result?.ok && !result.value?.cancelled && result.value) {
      const code = result.value.code || result.value.invite_code || result.value.id;
      try {
        if (code && navigator.clipboard?.writeText) await navigator.clipboard.writeText(String(code));
        notify?.(code ? ('Код приглашения: ' + code) : 'Приглашение создано.');
      } catch {
        notify?.(code ? ('Код приглашения: ' + code) : 'Приглашение создано.');
      }
    }
    return result;
  };
  win.rimChannelRevokeInvite = async id => report(await channelCommands.revokeInvite(id));
  win.rimChannelCopyInvite = async code => {
    try {
      await navigator.clipboard.writeText(String(code));
      notify?.('Код приглашения скопирован.');
    } catch {
      notify?.('Код приглашения: ' + code);
    }
  };
  win.rimJoinChannelByInvite = async () => {
    const code = win.prompt?.('Вставьте код приглашения в канал:');
    if (code === null || code === undefined) return;
    const result = report(await channelCommands.joinByInvite(code));
    if (result?.ok && !result.value?.cancelled) notify?.('Вы подписались на канал.');
    return result;
  };
  win.rimSetChannelMemberRoleByName = async () => {
    const result = report(await channelCommands.setMemberRoleByUsername({
      username: doc.getElementById('rimChannelRoleUsername')?.value,
      role: doc.getElementById('rimChannelRoleSelect')?.value
    }));
    if (result?.ok) notify?.('Роль участника изменена.');
    return result;
  };

  lifecycle?.add?.(() => { win.__RIM_CHANNEL_COMMANDS_OWNED = false; });
  logger?.info?.('composition.channelsSurface.bound', {});

  return {
    channelDirectory,
    channelFeed,
    channelSettings,
    channelCommands
  };
}
