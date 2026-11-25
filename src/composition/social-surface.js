/**
 * Composition root: social actions — direct chat lookup, reports, forward.
 */
import { DirectChatService } from '../application/direct-chat-service.js';
import { ReportService } from '../application/report-service.js';
import { ForwardMessageService } from '../application/forward-message-service.js';

/**
 * @param {object} deps
 */
export function bindSocialSurface({
  client,
  e2eScopeRepository = null,
  getUser,
  getMessages,
  getConversations,
  getActiveConversation,
  notify,
  logger,
  container,
  lifecycle,
  documentRef = globalThis.document,
  windowRef = globalThis.window
} = {}) {
  const win = windowRef;
  const doc = documentRef;

  const directChat = new DirectChatService({
    client,
    getUser,
    notify,
    showProfile: profile => {
      if (typeof win.showUserProfile === 'function') return win.showUserProfile(profile);
      const name = profile.display_name || profile.username || 'Пользователь';
      const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[ch]);
      win.showModal?.(`<h2 class="modal-title">Профиль пользователя</h2>
      <div class="profile-block"><div class="avatar profile-avatar">${profile.avatar_url ? `<img src="${esc(profile.avatar_url)}">` : esc(String(name).slice(0, 1))}</div>
      <div><strong>${esc(name)}</strong><div class="muted">@${esc(profile.username || '')}</div></div></div>
      <p>${esc(profile.bio || 'Пользователь пока не добавил описание.')}</p>
      <div class="modal-actions"><button class="action-btn" onclick="closeModal()">Закрыть</button>
      <button class="primary-btn" onclick="closeModal();startChatWith('${esc(profile.id)}')">Написать</button>
      <button class="action-btn" onclick="closeModal();startSecretChatWith('${esc(profile.id)}')">🔒 Секретный чат E2E</button></div>`);
    },
    reloadConversations: async () => { await win.loadConversations?.(); },
    openConversation: async id => { await win.openConversation?.(id); },
    logger
  });
  container?.value?.('directChat', directChat);
  win.__RIM_DIRECT_CHAT_OWNED = true;
  win.showUserProfile = profile => {
    const name = profile?.display_name || profile?.username || 'Пользователь';
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
    win.showModal?.(`<h2 class="modal-title">Профиль пользователя</h2>
      <div class="profile-block"><div class="avatar profile-avatar">${profile?.avatar_url ? `<img src="${esc(profile.avatar_url)}">` : esc(String(name).slice(0, 1))}</div>
      <div><strong>${esc(name)}</strong><div class="muted">@${esc(profile?.username || '')}</div></div></div>
      <p>${esc(profile?.bio || 'Пользователь пока не добавил описание.')}</p>
      <div class="modal-actions"><button class="action-btn" onclick="closeModal()">Закрыть</button>
      <button class="primary-btn" onclick="closeModal();startChatWith('${esc(profile?.id)}')">Написать</button>
      <button class="action-btn" onclick="closeModal();startSecretChatWith('${esc(profile?.id)}')">🔒 Секретный чат E2E</button><button class="action-btn" onclick="closeModal();rimOpenAddUserToGroup('${esc(profile?.id)}','${esc(profile?.username || '')}')">Добавить в группу</button></div>`);
  };
  win.findUserByName = async username => {
    const result = await directChat.findByUsername(username);
    if (!result.ok) notify?.(result.error?.message || 'Пользователь не найден.');
    return result;
  };
  win.rimOpenAddUserToGroup = async (userId, username) => {
    const groups = (getConversations?.() || []).filter(row => row?.type === 'group');
    if (!groups.length) { notify?.('Сначала создайте группу или вступите в существующую.'); return null; }
    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
    const rows = groups.map(group => '<button type="button" class="rim-search-result-card" style="width:100%;color:var(--text)" onclick="rimGroupAddMember(\'' + esc(group.id) + '\',\'' + esc(username) + '\')"><span class="grow"><b>' + esc(group.title || 'Группа') + '</b><small class="rim-update-muted">Добавить @' + esc(username) + '</small></span><span>›</span></button>').join('');
    win.showModal?.('<h2 class="modal-title">Добавить пользователя в группу</h2><p class="feature-small">Права администратора проверяются на сервере.</p>' + rows + '<button class="action-btn" style="width:100%;margin-top:10px" onclick="closeModal()">Отмена</button>');
    return { userId, username };
  };
  win.startChatWith = async userId => {
    const result = await directChat.startWith(userId);
    if (!result.ok) notify?.(result.error?.message || 'Не удалось начать чат.');
    return result;
  };
  win.startSecretChatWith = async userId => {
    const result = await directChat.startSecretWith(userId);
    if (!result.ok) notify?.(result.error?.message || 'Не удалось создать секретный чат.');
    else notify?.('Секретный чат создан. Открой его и нажми 🔒 в заголовке, чтобы проверить зашифрованный обмен.');
    return result;
  };
  lifecycle?.add?.(() => { win.__RIM_DIRECT_CHAT_OWNED = false; });

  const reportService = new ReportService({
    client,
    getUser,
    notify,
    logger
  });
  container?.value?.('reports', reportService);
  win.__RIM_REPORTS_OWNED = true;
  win.openReportForm = (prefill = {}) => reportService.openForm(prefill);
  win.submitReport = async () => {
    const result = await reportService.submitFromDom();
    if (!result.ok) notify?.(result.error?.message || 'Не удалось отправить жалобу');
    return result;
  };
  win.rimSubmitReport = async (type, messageId, conversationId, channelId, commentId) => {
    const details = doc.getElementById('rimReportDetails')?.value;
    const reason = doc.getElementById('rimReportReason')?.value;
    const result = await reportService.submitStructured({
      type, messageId, conversationId, channelId, commentId, reason, details
    });
    if (!result.ok) notify?.(result.error?.message || 'Не удалось отправить жалобу');
    return result;
  };
  lifecycle?.add?.(() => { win.__RIM_REPORTS_OWNED = false; });

  const forwardMessages = new ForwardMessageService({
    client,
    e2eScopeRepository,
    getUser,
    getMessages,
    getConversations,
    getActiveConversation,
    notify,
    reloadMessages: async () => { await win.loadMessages?.(); },
    logger
  });
  container?.value?.('forwardMessages', forwardMessages);
  win.__RIM_FORWARD_OWNED = true;
  win.rimForwardChoose = id => forwardMessages.chooseTarget(id);
  win.rimForwardMessage = async (id, targetId) => {
    const hide = doc.getElementById('rimForwardHideSender')?.checked === true;
    const result = await forwardMessages.forward(id, targetId, hide);
    // ForwardMessageService already notifies, closes modal, and reloads when active.
    if (!result.ok) notify?.('Не удалось переслать: ' + (result.error?.message || result.error));
    return result;
  };
  win.rimDoForward = (id, conversationId, hideSender = false) =>
    forwardMessages.forward(id, conversationId, hideSender);
  win.rimForward = win.rimForwardChoose;
  lifecycle?.add?.(() => { win.__RIM_FORWARD_OWNED = false; });

  logger?.info?.('composition.socialSurface.bound', {});
  return { directChat, reportService, forwardMessages };
}
