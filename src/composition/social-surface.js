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
    if (!result.ok) notify?.(result.error?.message || 'Не удалось создать запрос на секретный чат.');
    else {
      const row = (getConversations?.() || []).find(item => String(item.id) === String(result.value));
      notify?.(row?.is_secret === true
        ? 'Секретный чат уже существует. Проверяю защищённый обмен.'
        : 'Предложение отправлено. Собеседник увидит его при следующем входе; до принятия этот диалог не принимает сообщения.');
    }
    return result;
  };

  const deferredSecretRequests = new Set();
  let secretRequestModalOpen = false;
  let secretInboxChannel = null;
  let secretInboxUserId = '';
  let secretAuthSubscription = null;
  const escapeSecretText = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);

  const showNextSecretChatRequest = async () => {
    const user = getUser?.();
    if (!user?.id || secretRequestModalOpen || typeof win.showModal !== 'function') return null;
    const { data: requests, error } = await client.from('rim_secret_chat_requests')
      .select('id,conversation_id,requester_id,created_at')
      .eq('recipient_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(20);
    if (error) {
      logger?.warn?.('secret_chat.inbox.load_failed', { message: error.message });
      return null;
    }
    const request = (requests || []).find(row => !deferredSecretRequests.has(String(row.id)));
    if (!request) return null;

    let profile = null;
    try {
      const result = await client.from('profiles')
        .select('id,username,display_name,avatar_url,avatar_path')
        .eq('id', request.requester_id)
        .maybeSingle();
      if (!result.error) profile = result.data;
      if (profile?.avatar_path && client.storage) {
        const signed = await client.storage.from('avatars').createSignedUrl(profile.avatar_path, 1800);
        if (!signed.error && signed.data?.signedUrl) profile.avatar_url = signed.data.signedUrl;
      }
    } catch (error) {
      logger?.warn?.('secret_chat.inbox.profile_failed', { message: error?.message || String(error) });
    }
    const name = profile?.display_name || profile?.username || 'Пользователь';
    const avatar = profile?.avatar_url
      ? '<img src="' + escapeSecretText(profile.avatar_url) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">'
      : escapeSecretText(String(name).slice(0, 1).toUpperCase() || 'Р');
    secretRequestModalOpen = true;
    win.showModal(`<h2 class="modal-title">🔒 Предложение секретного чата</h2>
      <div class="profile-block" style="margin:12px 0 16px">
        <div class="avatar profile-avatar">${avatar}</div>
        <div><strong>${escapeSecretText(name)}</strong><div class="muted">${profile?.username ? '@' + escapeSecretText(profile.username) : 'Новый секретный диалог'}</div></div>
      </div>
      <p>Пользователь предлагает создать отдельный чат с E2E-шифрованием. Обычные переписки это не затрагивает. После принятия RIM запустит защищённый обмен ключами; до его завершения отправка сообщений будет заблокирована.</p>
      <div class="modal-actions">
        <button class="action-btn" type="button" onclick="rimDeferSecretChatRequest('${escapeSecretText(request.id)}')">Позже</button>
        <button class="action-btn danger-btn" type="button" onclick="rimDeclineSecretChatRequest('${escapeSecretText(request.id)}')">Отклонить</button>
        <button class="primary-btn" type="button" onclick="rimAcceptSecretChatRequest('${escapeSecretText(request.id)}')">Принять</button>
      </div>`);
    return request.id;
  };

  win.rimShowSecretChatRequests = () => showNextSecretChatRequest();
  win.rimDeferSecretChatRequest = requestId => {
    if (requestId) deferredSecretRequests.add(String(requestId));
    secretRequestModalOpen = false;
    win.closeModal?.();
  };
  win.rimAcceptSecretChatRequest = async requestId => {
    secretRequestModalOpen = false;
    const result = await directChat.acceptSecretRequest(requestId);
    win.closeModal?.();
    if (!result.ok) {
      notify?.(result.error?.message || 'Не удалось принять запрос на секретный чат.');
      return result;
    }
    let verified = null;
    try { verified = await win.rimVerifyE2E?.(); } catch { /* handshake may finish when the peer reconnects */ }
    if (verified) notify?.('Запрос принят. Защищённый обмен E2E подтверждён.');
    else notify?.('Запрос принят. RIM продолжает защищённый обмен; отправка останется заблокированной до его завершения.');
    setTimeout(() => { void showNextSecretChatRequest(); }, 350);
    return result;
  };
  win.rimDeclineSecretChatRequest = async requestId => {
    secretRequestModalOpen = false;
    const result = await directChat.declineSecretRequest(requestId);
    win.closeModal?.();
    if (!result.ok) notify?.(result.error?.message || 'Не удалось отклонить запрос.');
    else notify?.('Предложение секретного чата отклонено.');
    setTimeout(() => { void showNextSecretChatRequest(); }, 350);
    return result;
  };

  const bindSecretInbox = userId => {
    const nextId = String(userId || '');
    if (nextId === secretInboxUserId) return;
    if (secretInboxChannel) {
      try { client.removeChannel?.(secretInboxChannel); } catch { /* ignore */ }
      secretInboxChannel = null;
    }
    secretInboxUserId = nextId;
    deferredSecretRequests.clear();
    if (!nextId || typeof client.channel !== 'function') return;
    secretInboxChannel = client.channel('rim-secret-chat-inbox:' + nextId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'rim_secret_chat_requests',
        filter: 'recipient_id=eq.' + nextId
      }, () => { void showNextSecretChatRequest(); })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'rim_secret_chat_requests',
        filter: 'requester_id=eq.' + nextId
      }, payload => {
        if (payload?.new?.status !== 'accepted') return;
        const conversationId = String(payload.new.conversation_id || '');
        void (async () => {
          await win.loadConversations?.();
          if (String(getActiveConversation?.()?.id || '') === conversationId) {
            await win.openConversation?.(conversationId);
            try {
              const verified = await win.rimVerifyE2E?.();
              if (!verified) notify?.('Секретный чат принят. Защищённый обмен продолжится при подключении собеседника.');
            } catch { /* no plaintext fallback */ }
          } else notify?.('Ваше предложение секретного чата принято. Чат появился в списке переписок.');
        })();
      })
      .subscribe();
  };

  if (client?.auth?.onAuthStateChange) {
    const authResult = client.auth.onAuthStateChange((event, session) => {
      const userId = session?.user?.id || getUser?.()?.id || '';
      if (event === 'SIGNED_OUT') bindSecretInbox('');
      else if (userId) {
        bindSecretInbox(userId);
        setTimeout(() => { void showNextSecretChatRequest(); }, 700);
      }
    });
    secretAuthSubscription = authResult?.data?.subscription || null;
  }
  setTimeout(() => {
    const userId = getUser?.()?.id;
    if (userId) {
      bindSecretInbox(userId);
      void showNextSecretChatRequest();
    }
  }, 1100);

  lifecycle?.add?.(() => {
    win.__RIM_DIRECT_CHAT_OWNED = false;
    try { secretAuthSubscription?.unsubscribe?.(); } catch { /* ignore */ }
    try { if (secretInboxChannel) client.removeChannel?.(secretInboxChannel); } catch { /* ignore */ }
    secretInboxChannel = null;
    secretInboxUserId = '';
    for (const key of ['rimShowSecretChatRequests','rimDeferSecretChatRequest','rimAcceptSecretChatRequest','rimDeclineSecretChatRequest']) {
      try { delete win[key]; } catch { /* ignore */ }
    }
  });

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
