/**
 * Composition: message mutation window routes (send/edit/delete/react).
 * Timeline binding stays in app.js next to MessageTimelineController.
 */
import { MessageCommandService } from '../application/message-command-service.js';
import { MessageOutboxService, isNetworkLikeError } from '../application/message-outbox-service.js';
import { ReplyTargetController } from '../application/reply-target-controller.js';

function reportMessageCommand(result, { notify, logger } = {}) {
  if (!result) return result;
  if (!result.ok) {
    const message = result.error?.message || result.error || 'Операция с сообщением не выполнена.';
    notify?.(String(message));
    logger?.warn?.('message.command.failed', { message: String(message) });
  }
  return result;
}

/**
 * @param {object} deps
 */
export function bindMessageCommandsSurface({
  messageRepository,
  storage,
  getUser,
  getConversation,
  getReplyTarget,
  getMessages,
  setMessages,
  getTopicId = () => null,
  noteOutgoing = async () => {},
  client,
  notify,
  logger,
  container,
  lifecycle,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  setReplyTarget = () => {}
} = {}) {
  const win = windowRef;
  const doc = documentRef;

  const canSendCache = new Map(); // conversationId -> {ok, at}
  const messageCommands = new MessageCommandService({
    repository: messageRepository,
    storage,
    getUser,
    getConversation,
    getReplyTarget,
    getTopicId,
    getMessages,
    setMessages,
    applyLocal: async (message, conversationId) => {
      if (!message?.id) {
        await win.loadMessages?.();
        return;
      }
      const activeId = getConversation?.()?.id;
      if (String(activeId) !== String(conversationId)) return;
      const current = getMessages?.() || [];
      if (current.some(row => String(row.id) === String(message.id))) {
        const box = doc.getElementById('messages');
        if (box) box.scrollTop = box.scrollHeight;
        return;
      }
      setMessages?.([...(current || []), message]);
      const box = doc.getElementById('messages');
      const stickBottom = box ? (box.scrollHeight - box.scrollTop - box.clientHeight < 120) : true;
      await win.renderMessages?.();
      const stick = () => {
        const box2 = doc.getElementById('messages');
        if (box2 && stickBottom) box2.scrollTop = box2.scrollHeight;
      };
      stick();
      requestAnimationFrame(() => { stick(); requestAnimationFrame(stick); });
    },
    onSent: async (message, conversationId) => {
      try { await noteOutgoing(message, conversationId); } catch { /* optional */ }
    },
    notifyPush: message => {
      if (!message?.id || !client?.functions?.invoke) return;
      void client.functions.invoke('rim-push', { body: { action: 'send_message', message_id: message.id } })
        .then(({ error, data }) => {
          if (error || data?.error) logger?.warn?.('push.message.delivery.failed', { message: String(error?.message || data?.error || 'unknown') });
        })
        .catch(error => logger?.warn?.('push.message.delivery.failed', { message: String(error?.message || error) }));
    },
    canSend: async ({ user, conversation }) => {
      if (conversation.type === 'group') return true;
      if (conversation.type !== 'direct') return new Error('Не удалось безопасно определить тип переписки для отправки из очереди.');
      if (!client?.from) return true;
      const cacheKey = String(conversation.id);
      const cached = canSendCache.get(cacheKey);
      if (cached && (Date.now() - cached.at) < 30000) return cached.ok;
      const { data: members, error: membersError } = await client.from('conversation_members')
        .select('user_id').eq('conversation_id', conversation.id);
      if (membersError) return membersError;
      const peerId = (members || []).map(row => row.user_id).find(id => String(id) !== String(user.id));
      if (!peerId) return new Error('Не удалось определить собеседника.');
      const [ownRes, revRes] = await Promise.all([
        client.from('user_blocks').select('blocked_id').eq('blocker_id', user.id).eq('blocked_id', peerId).maybeSingle(),
        client.from('user_blocks').select('blocker_id').eq('blocker_id', peerId).eq('blocked_id', user.id).maybeSingle()
      ]);
      if (ownRes.error) return ownRes.error;
      if (ownRes.data) {
        const err = new Error('Вы заблокировали этого пользователя. Разблокируйте его, чтобы отправлять сообщения.');
        canSendCache.set(cacheKey, { ok: err, at: Date.now() });
        return err;
      }
      if (revRes.error) return revRes.error;
      if (revRes.data) {
        const err = new Error('Этот пользователь ограничил переписку с вами.');
        canSendCache.set(cacheKey, { ok: err, at: Date.now() });
        return err;
      }
      canSendCache.set(cacheKey, { ok: true, at: Date.now() });
      return true;
    },
    notify,
    reload: async () => { await win.loadMessages?.(); },
    clearReply: () => win.cancelReply?.()
  });

  container?.value?.('messageCommands', messageCommands);
  win.__RIM_MESSAGE_COMMANDS_OWNED = true;

  const report = result => reportMessageCommand(result, { notify, logger });

  const outbox = new MessageOutboxService({
    sendText: async (body, options = {}) => messageCommands.sendText(body, options),
    notify,
    logger,
    windowRef: win,
    getUserId: () => getUser?.()?.id || null
  });
  outbox.bindOnlineListener();
  outbox.bindAuthListener(client?.auth);
  container?.value?.('messageOutbox', outbox);
  win.__rimMessageOutbox = outbox;
  win.__RIM_MESSAGE_OUTBOX_OWNED = true;
  win.rimFlushOutbox = () => outbox.flush();
  lifecycle?.add?.(() => {
    outbox.dispose();
    win.__RIM_MESSAGE_OUTBOX_OWNED = false;
    try { delete win.__rimMessageOutbox; } catch {}
  });


    win.sendMessage = async () => {
    const input = doc.getElementById('messageInput');
    const submittedText = (input?.value || '').trim();
    if (!submittedText) return;
    const conversationId = getConversation?.()?.id;
    // Optimistic UI: clear composer immediately so send feels instant.
    if (input) {
      input.value = '';
      input.style.height = '42px';
      try { input.focus({ preventScroll: true }); } catch { try { input.focus(); } catch {} }
    }
    doc.getElementById('stickerPanel')?.classList.add('hidden');
    const result = report(await messageCommands.sendText(submittedText));
    if (!result?.ok) {
      const err = result?.error;
      if (isNetworkLikeError(err) || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
        const queued = outbox.enqueueText({
          userId: getUser?.()?.id,
          conversationId,
          conversationType: getConversation?.()?.type || '',
          body: submittedText
        });
        if (queued.ok) {
          notify?.('Нет сети. Сообщение сохранено в очереди и уйдёт при восстановлении связи.');
          try { await win.renderMessages?.(); } catch { /* optional */ }
          return queued;
        }
      }
      if (input && !input.value) {
        input.value = submittedText;
      }
    }
    return result;
  };

  win.sendSticker = async sticker => {
    const conversationId = getConversation?.()?.id;
    const result = report(await messageCommands.sendSticker(sticker));
    if (result?.ok && String(getConversation?.()?.id) === String(conversationId)) {
      doc.getElementById('stickerPanel')?.classList.add('hidden');
    }
    return result;
  };

  win.sendImage = async file => {
    const result = report(await messageCommands.sendImage(file));
    if (file) {
      const input = doc.getElementById('imageInput');
      if (input) input.value = '';
    }
    return result;
  };

  win.editMessage = async id => {
    const message = (getMessages?.() || []).find(row => String(row.id) === String(id));
    if (!message) return notify?.('Сообщение не найдено.');
    const next = win.prompt?.('Измени текст сообщения:', message.body || '');
    if (next === null || next === undefined) return;
    return report(await messageCommands.edit(id, next));
  };

  win.deleteMessage = async id => {
    if (!win.confirm?.('Удалить это сообщение?')) return;
    return report(await messageCommands.remove(id));
  };

  win.reactToMessage = async (id, emoji) => {
    const result = report(await messageCommands.react(id, emoji));
    if (result?.ok) notify?.('Реакция добавлена.');
    return result;
  };

  const replyTargets = new ReplyTargetController({
    getMessages,
    setReplyTarget,
    logger
  });
  container?.value?.('replyTargets', replyTargets);
  win.__RIM_REPLY_TARGET_OWNED = true;
  win.setReply = id => replyTargets.setReply(id);
  win.cancelReply = () => replyTargets.cancel();
  lifecycle?.add?.(() => {
    win.__RIM_MESSAGE_COMMANDS_OWNED = false;
    win.__RIM_REPLY_TARGET_OWNED = false;
    replyTargets.dispose?.();
  });

  const resolveMessageById = id => {
    const rows = [
      ...(getMessages?.() || []),
      ...(win.messagesCache || []),
      ...(win.__RIM_LEGACY_CONTEXT?.getMessages?.() || [])
    ];
    return rows.find(row => String(row.id) === String(id)) || null;
  };

  win.rimOpenMessageActions = id => {
    const rows = getMessages?.() || [];
    const m = rows.find(row => String(row.id) === String(id));
    if (!m) return notify?.('Сообщение уже не найдено.');
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const body = esc((m.body || 'Вложение')).slice(0, 800);
    const sid = esc(id);
    win.showModal?.(`<h2 class="modal-title">Действия с сообщением</h2>
      <div class="rim-update-card" style="white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:10px">${body}</div>
      <div class="rim-page-grid">
        <button class="action-btn" type="button" onclick="rimCopyMessage('${sid}')">Копировать</button>
        <button class="action-btn" type="button" onclick="rimSaveMessageToFavorites('${sid}');closeModal()">В Избранное</button>
        <button class="action-btn" type="button" onclick="rimForwardChoose('${sid}')">Переслать</button>
        <button class="action-btn" type="button" onclick="setReply('${sid}');closeModal()">Ответить</button>
        <button class="action-btn" type="button" onclick="reactToMessage('${sid}','👍');closeModal()">👍</button>
        <button class="action-btn" type="button" onclick="reactToMessage('${sid}','❤️');closeModal()">❤️</button>
      </div>
      <button class="action-btn" style="width:100%;margin-top:10px" type="button" onclick="closeModal()">Закрыть</button>`);
  };

  win.rimCopyMessage = async id => {
    const m = resolveMessageById(id);
    if (!m) return;
    try {
      await navigator.clipboard.writeText(m.body || '');
      notify?.('Текст скопирован.');
      win.closeModal?.();
    } catch {
      notify?.('Браузер не разрешил копирование.');
    }
  };

  win.rimForwardChoose = id => {
    const activeId = getConversation?.()?.id;
    const chatSource = win.__RIM_LEGACY_CONTEXT?.getConversations?.() || win.conversations || [];
    const chats = (Array.isArray(chatSource) ? chatSource : []).filter(c => String(c.id) !== String(activeId));
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const list = chats.map(c => {
      const title = esc(c.title || (c.type === 'direct' ? 'Личная переписка' : 'Группа'));
      const kind = c.type === 'group' ? 'Групповая беседа' : 'Личный чат';
      return `<button class="feature-tile" type="button" onclick="rimForwardMessage('${esc(id)}','${esc(c.id)}')">
        <b>${title}</b><small>${kind}</small>
        <label style="display:flex;gap:6px;align-items:center;margin-top:6px;font-size:12px;color:var(--muted)">
          <input type="checkbox" id="rimFwdHide-${esc(c.id)}" /> Скрыть имя отправителя
        </label>
      </button>`;
    }).join('') || '<div class="empty-state">Нет других переписок.</div>';
    win.showModal?.(`<h2 class="modal-title">Переслать сообщение</h2>${list}
      <button class="action-btn" style="width:100%;margin-top:10px" type="button" onclick="closeModal()">Отмена</button>`);
  };

  win.rimForwardMessage = async (id, targetId) => {
    const hide = !!doc.getElementById(`rimFwdHide-${targetId}`)?.checked;
    if (typeof win.rimDoForward === 'function') {
      const result = await win.rimDoForward(id, targetId, hide);
      win.closeModal?.();
      if (result?.ok !== false) notify?.('Сообщение переслано' + (hide ? ' без имени отправителя.' : '.'));
      return result;
    }
    notify?.('Пересылка недоступна.');
  };


  logger?.info?.('composition.messageCommandsSurface.bound', {});
  return { messageCommands, replyTargets };
}

