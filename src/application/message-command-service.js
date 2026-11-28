import { Err, Ok } from '../core/result.js';
import {
  MESSAGE_BODY_MAX_LENGTH,
  MESSAGE_IMAGE_MAX_BYTES,
  MESSAGE_IMAGE_EXTENSIONS,
  normalizeMessageBody,
  validateImageAttachment
} from '../domain/message.js';
import { evaluateSendAllowed, recordSendTimestamp } from '../domain/send-policy.js';

const MAX_BODY_LENGTH = MESSAGE_BODY_MAX_LENGTH;
const MAX_IMAGE_BYTES = MESSAGE_IMAGE_MAX_BYTES;
const IMAGE_EXTENSIONS = MESSAGE_IMAGE_EXTENSIONS;

/** Application boundary for message mutations. The legacy renderer remains responsible for presentation. */
export class MessageCommandService {
  constructor({ repository, storage, getUser, getConversation, getReplyTarget = () => null, getTopicId = () => null, getMessages = () => [], setMessages = null, canSend = async () => true, e2eScopeRepository = null, e2eRuntime = null, notify = () => {}, reload = async () => {}, applyLocal = null, clearReply = () => {}, onSent = null, notifyPush = null }) {
    this.repository = repository;
    this.storage = storage;
    this.getUser = getUser;
    this.getConversation = getConversation;
    this.getReplyTarget = getReplyTarget;
    this.getTopicId = getTopicId;
    this.getMessages = getMessages;
    this.setMessages = setMessages;
    this.canSend = canSend;
    this.e2eScopeRepository = e2eScopeRepository;
    this.e2eRuntime = e2eRuntime;
    this.notify = notify;
    this.reload = reload;
    this.applyLocal = applyLocal;
    this.clearReply = clearReply;
    this.onSent = onSent;
    this.notifyPush = notifyPush;
    this.inFlight = new Set();
    /** @type {Map<string, number[]>} */
    this.sendTimestampsByConversation = new Map();
  }

  async exclusive(key, operation) {
    if (this.inFlight.has(key)) return Err(new Error('Операция уже выполняется.'));
    this.inFlight.add(key);
    try { return await operation(); }
    catch (error) { return Err(error); }
    finally { this.inFlight.delete(key); }
  }

  context() {
    const user = this.getUser();
    const conversation = this.getConversation();
    if (!user?.id) return Err(new Error('Необходимо войти в аккаунт.'));
    if (!conversation?.id) return Err(new Error('Сначала выбери переписку.'));
    return Ok({ user, conversation });
  }

  clearReplyIfUnchanged(conversationId, replyId) {
    if (replyId && String(this.getConversation()?.id) === String(conversationId) && String(this.getReplyTarget()?.id) === String(replyId)) this.clearReply();
  }

  async refreshIfCurrent(conversationId, sentMessage = null) {
    if (String(this.getConversation()?.id) !== String(conversationId)) return;
    try {
      if (sentMessage && typeof this.applyLocal === 'function') {
        await this.applyLocal(sentMessage, conversationId);
        try { await this.onSent?.(sentMessage, conversationId); } catch { /* ignore */ }
        return;
      }
      await this.reload();
    } catch (error) {
      this.notify(`Сообщение сохранено, но обновить переписку не удалось: ${error?.message || error}`);
    }
  }

  messageInCurrentConversation(messageId, conversationId) {
    return (this.getMessages() || []).some(row => String(row.id) === String(messageId) && String(row.conversation_id) === String(conversationId));
  }

  isLocalE2EMessage(messageId) {
    return (this.getMessages() || []).some(row => String(row.id) === String(messageId) && (row._rimLocalOnly === true || row._rimE2E === true));
  }

  e2eScopeInput(conversation) {
    if (!conversation?.id) return null;
    if (conversation.type === 'direct') return { type: 'direct', id: conversation.id };
    if (conversation.type === 'group') {
      if (typeof conversation.is_private !== 'boolean') {
        throw new Error('Не удалось подтвердить приватность групповой переписки; отправка открытого текста остановлена.');
      }
      return { type: 'group', id: conversation.id, is_private: conversation.is_private };
    }
    return null;
  }

  async inspectE2EScope(conversation, user) {
    if (!this.e2eScopeRepository) return Ok({ enabled: false, scope: null });
    let input;
    try { input = this.e2eScopeInput(conversation); }
    catch (error) { return Err(error); }
    if (!input) return Ok({ enabled: false, scope: input });
    const result = await this.e2eScopeRepository.getScope(input, user?.id);
    return result.ok ? result : Err(result.error || new Error('Не удалось проверить режим E2E.'));
  }

  async canQueuePlaintextOutbox(conversation = this.getConversation?.(), user = this.getUser?.()) {
    if (!conversation?.id || !user?.id) return Err(new Error('Нельзя сохранить сообщение в очереди без текущего аккаунта и переписки.'));
    if (!['direct', 'group'].includes(conversation.type)) return Ok(true);
    // Outbox v2 stores plaintext in localStorage. It must never be used for a
    // scope that requires E2E, nor when scope lookup/privacy cannot be verified.
    if (!this.e2eScopeRepository) return Err(new Error('Защищённая проверка режима переписки недоступна; открытый текст не сохранён в очереди.'));
    const scope = await this.inspectE2EScope(conversation, user);
    if (!scope.ok) return Err(scope.error);
    if (scope.value?.pendingSecretRequest || scope.value?.plaintextBlocked) return Err(new Error('Секретный чат ожидает принятия приглашения. Сообщения пока не отправляются.'));
    if (scope.value?.enabled) return Err(new Error('Эта переписка требует E2E. Открытый текст не сохранён в офлайн-очереди.'));
    return Ok(true);
  }

  async assertLegacyPayloadAllowed(conversation, user) {
    if (!['direct', 'group'].includes(conversation?.type)) return Ok(true);
    const scopeResult = await this.inspectE2EScope(conversation, user);
    if (!scopeResult.ok) return Err(scopeResult.error);
    if (scopeResult.value?.pendingSecretRequest || scopeResult.value?.plaintextBlocked) return Err(new Error('Секретный чат ожидает принятия приглашения. Вложение не отправлено.'));
    if (scopeResult.value?.enabled) return Err(new Error(scopeResult.value.readiness?.reason || 'Эта переписка требует E2E. Вложение не отправлено открытым способом.'));
    return Ok(true);
  }

  assertSendPolicy(conversationId) {
    const key = String(conversationId || '');
    const recent = this.sendTimestampsByConversation.get(key) || [];
    const decision = evaluateSendAllowed(recent, Date.now());
    if (!decision.ok) return Err(new Error(decision.error));
    return Ok(true);
  }

  noteSuccessfulSend(conversationId) {
    const key = String(conversationId || '');
    const recent = this.sendTimestampsByConversation.get(key) || [];
    this.sendTimestampsByConversation.set(key, recordSendTimestamp(recent, Date.now()));
  }

  async prepareSend() {
    const context = this.context();
    if (!context.ok) return context;
    const allowed = await this.canSend(context.value);
    if (allowed !== true) return Err(allowed instanceof Error ? allowed : new Error('Отправка сообщений в эту переписку сейчас недоступна.'));
    return context;
  }

  async sendText(rawBody, options = {}) {
    const normalized = normalizeMessageBody(rawBody);
    if (!normalized.ok) return Err(new Error(normalized.error));
    const body = normalized.body;
    if (Array.from(body).length > MAX_BODY_LENGTH) return Err(new Error(`Сообщение не должно превышать ${MAX_BODY_LENGTH} символов.`));
    const fromOutbox = Boolean(options.fromOutbox);
    const reply = fromOutbox
      ? (options.replyToMessageId ? { id: options.replyToMessageId } : null)
      : this.getReplyTarget();
    const topicId = fromOutbox ? (options.topicId || null) : this.getTopicId();
    const exclusiveKey = fromOutbox ? `send-outbox:${options.outboxId || body.slice(0, 24)}` : 'send';
    return this.exclusive(exclusiveKey, async () => {
      let user;
      let conversationId;
      let conversationSnapshot = null;
      if (fromOutbox && options.conversationId) {
        user = this.getUser?.();
        if (!user?.id) return Err(new Error('Требуется вход в РИМ.'));
        if (options.expectedUserId && String(user.id) !== String(options.expectedUserId)) return Err(new Error('Аккаунт изменился. Очередь другого пользователя не будет отправлена.'));
        conversationId = String(options.conversationId);
        const allowed = await this.canSend({ user, conversation: { id: conversationId, type: options.conversationType || 'unknown' } });
        if (allowed !== true) {
          return Err(allowed instanceof Error ? allowed : new Error('Отправка из очереди недоступна.'));
        }
        if (options.expectedUserId && String(this.getUser?.()?.id) !== String(options.expectedUserId)) {
          return Err(new Error('Аккаунт изменился во время проверки. Повторная отправка остановлена.'));
        }
      } else {
        const context = await this.prepareSend();
        if (!context.ok) return context;
        user = context.value.user;
        conversationSnapshot = context.value.conversation;
        conversationId = context.value.conversation.id;
        const policy = this.assertSendPolicy(conversationId);
        if (!policy.ok) return policy;
      }
      // E2E-required direct chats and private groups never fall through to
      // the legacy plaintext `chat_messages.body` insert. The protected path
      // verifies every participant and persists only in the encrypted local timeline.
      const currentConversation = fromOutbox
        ? { id: conversationId, type: options.conversationType || 'unknown', ...(typeof options.conversationIsPrivate === 'boolean' ? { is_private: options.conversationIsPrivate } : {}) }
        : conversationSnapshot;
      if (['direct', 'group'].includes(currentConversation?.type) && this.e2eScopeRepository) {
        const scopeResult = await this.inspectE2EScope(currentConversation, user);
        if (!scopeResult.ok) return Err(scopeResult.error || new Error('Не удалось проверить режим E2E этой переписки.'));
        if (scopeResult.value?.pendingSecretRequest || scopeResult.value?.plaintextBlocked) {
          return Err(new Error('Секретный чат ожидает принятия приглашения. Сообщения пока не отправляются.'));
        }
        if (scopeResult.value?.enabled) {
          let protectedScope = scopeResult.value;
          let readiness = protectedScope.readiness;
          // If every participant already has an active compatible device,
          // establish a real encrypted challenge/ACK exchange automatically
          // before allowing the first protected message. No plaintext fallback.
          if (!readiness?.ready && Array.isArray(readiness?.missingUserIds) && readiness.missingUserIds.length === 0
            && Array.isArray(protectedScope.memberUserIds) && this.e2eRuntime?.verifyScopeExchange) {
            try {
              await this.e2eRuntime.startIncoming();
              await this.e2eRuntime.verifyScopeExchange({ type: currentConversation.type === 'direct' ? 'direct' : 'group', id: conversationId }, protectedScope.memberUserIds);
              const refreshed = await this.inspectE2EScope(currentConversation, user);
              if (!refreshed.ok) return Err(refreshed.error);
              protectedScope = refreshed.value;
              readiness = protectedScope.readiness;
            } catch (error) {
              return Err(new Error(`Автоматическая проверка E2E не завершилась: ${error?.message || error}. Открытый текст не отправлен.`));
            }
          }
          if (!readiness?.ready) return Err(new Error(readiness?.reason || 'Эта переписка требует E2E, но защищённый протокол ещё не готов. Открытый текст не отправлен.'));
          const isDirect = currentConversation.type === 'direct';
          if (isDirect && (!protectedScope.peerUserId || !this.e2eRuntime?.sendDirect)) {
            return Err(new Error('Для этой E2E-переписки не готов защищённый маршрут доставки. Открытый текст не отправлен.'));
          }
          if (!isDirect && (currentConversation.type !== 'group' || !this.e2eRuntime?.sendGroup || !Array.isArray(protectedScope.memberUserIds))) {
            return Err(new Error('Для этой E2E-группы не готов защищённый маршрут доставки. Открытый текст не отправлен.'));
          }
          if (fromOutbox && options.expectedUserId && String(this.getUser?.()?.id) !== String(options.expectedUserId)) {
            return Err(new Error('Аккаунт изменился во время проверки E2E. Отправка из очереди остановлена.'));
          }
          if (String(this.getUser?.()?.id || '') !== String(user.id)) {
            return Err(new Error('Аккаунт изменился во время подготовки E2E-отправки. Сообщение не отправлено.'));
          }
          const encryptedOptions = { conversationId, replyTo: reply?.id || null, clientMessageId: fromOutbox ? (options.outboxId || null) : null };
          const encryptedResult = isDirect
            ? await this.e2eRuntime.sendDirect(protectedScope.peerUserId, body, encryptedOptions)
            : await this.e2eRuntime.sendGroup(protectedScope.memberUserIds, body, encryptedOptions);
          const messageId = String(encryptedResult?.messageId || encryptedResult?.id || '');
          if (!messageId) return Err(new Error('SDK не вернул идентификатор защищённого сообщения.'));
          if (String(this.getUser?.()?.id || '') !== String(user.id)) {
            this.notify('E2E-сообщение было принято транспортом, но аккаунт сменился до сохранения локальной копии. Оно не добавлено в историю нового аккаунта; не отправляй его повторно.');
            return Ok({ id: messageId, conversation_id: conversationId, _rimE2E: true, _rimLocalOnly: true, _rimAcceptedBeforeAccountSwitch: true });
          }
          let local = encryptedResult.localMessage || null;
          try {
            const localRows = await this.e2eRuntime.getLocalConversation(conversationId, { limit: 500 });
            local = (localRows || []).find(row => String(row.messageId) === messageId) || local;
          } catch { /* relay acceptance must not be reported as an unsent message */ }
          if (!local) return Err(new Error('SDK подтвердил отправку, но не вернул локальную копию. Не повторяй отправку автоматически; проверь состояние переписки.'));
          if (encryptedResult.localPersisted === false) this.notify('Сообщение принято E2E-доставкой, но локальная история не сохранилась на этом устройстве. Не отправляй его повторно.');
          const sentMessage = {
            id: messageId, conversation_id: conversationId, sender_id: String(user.id),
            body: String(local.body || body), created_at: new Date(Number(local.timestamp || Date.now())).toISOString(),
            reply_to_message_id: local.replyTo || null, _rimE2E: true, _rimLocalOnly: true, _rimEncrypted: true
          };
          this.clearReplyIfUnchanged(conversationId, reply?.id);
          if (!fromOutbox) this.noteSuccessfulSend(conversationId);
          await this.refreshIfCurrent(conversationId, sentMessage);
          return Ok(sentMessage);
        }
      }

      if (String(this.getUser?.()?.id || '') !== String(user.id)) {
        return Err(new Error('Аккаунт изменился во время подготовки отправки. Сообщение не отправлено.'));
      }
      const result = await this.repository.insert({
        conversation_id: conversationId,
        sender_id: user.id,
        body,
        ...(fromOutbox && options.outboxId ? { client_message_id: String(options.outboxId) } : {}),
        reply_to_message_id: reply?.id || null,
        ...(topicId ? { topic_id: topicId } : {})
      });
      if (!result.ok) return result;
      try { void this.notifyPush?.(result.value); } catch { /* push is best-effort and never blocks message delivery */ }
      if (!fromOutbox) this.noteSuccessfulSend(conversationId);
      this.clearReplyIfUnchanged(conversationId, reply?.id);
      await this.refreshIfCurrent(conversationId, result.value);
      return result;
    });
  }

  async sendSticker(sticker) {
    const value = String(sticker ?? '').trim();
    if (!value || value.length > 64) return Err(new Error('Некорректный стикер.'));
    const topicId = this.getTopicId();
    return this.exclusive('send', async () => {
      const context = await this.prepareSend();
      if (!context.ok) return context;
      const { user, conversation } = context.value;
      const policy = this.assertSendPolicy(conversation.id);
      if (!policy.ok) return policy;
      const e2ePolicy = await this.assertLegacyPayloadAllowed(conversation, user);
      if (!e2ePolicy.ok) return e2ePolicy;
      const result = await this.repository.insert({
        conversation_id: conversation.id, sender_id: user.id, body: '', sticker_id: value,
        ...(topicId ? { topic_id: topicId } : {})
      });
      if (!result.ok) return result;
      try { void this.notifyPush?.(result.value); } catch { /* best effort */ }
      this.noteSuccessfulSend(conversation.id);
      await this.refreshIfCurrent(conversation.id, result.value);
      return result;
    });
  }

  async sendImage(file) {
    if (!file) return Ok(null);
    if (!IMAGE_EXTENSIONS[file.type]) return Err(new Error('Поддерживаются JPG, PNG, WEBP и GIF.'));
    if (file.size > MAX_IMAGE_BYTES) return Err(new Error('Максимальный размер фотографии — 5 МБ.'));
    const reply = this.getReplyTarget();
    const topicId = this.getTopicId();
    return this.exclusive('send', async () => {
      const context = await this.prepareSend();
      if (!context.ok) return context;
      if (!this.storage?.from) return Err(new Error('Хранилище файлов недоступно.'));
      const { user, conversation } = context.value;
      const userId = String(user.id);
      const conversationId = String(conversation.id);
      const contextIsCurrent = () => String(this.getUser?.()?.id || '') === userId
        && String(this.getConversation?.()?.id || '') === conversationId;
      const e2ePolicy = await this.assertLegacyPayloadAllowed(conversation, user);
      if (!e2ePolicy.ok) return e2ePolicy;
      if (!contextIsCurrent()) return Err(new Error('Аккаунт или переписка изменились во время проверки E2E. Фотография не отправлена.'));
      const path = `${userId}/${conversationId}/${crypto.randomUUID()}.${IMAGE_EXTENSIONS[file.type]}`;
      this.notify('Загружаю фотографию...');
      const upload = await this.storage.from('chat-files').upload(path, file, { contentType: file.type, upsert: false });
      if (upload.error) return Err(upload.error);
      if (!contextIsCurrent()) {
        try { await this.storage.from('chat-files').remove([path]); } catch { /* best-effort orphan cleanup */ }
        return Err(new Error('Аккаунт или переписка изменились во время загрузки. Фотография удалена из очереди отправки.'));
      }
      const result = await this.repository.insert({
        conversation_id: conversation.id, sender_id: user.id, body: '', image_path: path,
        reply_to_message_id: reply?.id || null,
        ...(topicId ? { topic_id: topicId } : {})
      });
      if (!result.ok) {
        try {
          const cleanup = await this.storage.from('chat-files').remove([path]);
          if (cleanup.error) return Err(new Error(`${result.error?.message || 'Не удалось создать сообщение.'}; файл остался в хранилище: ${path}`, { cause: result.error }));
        } catch (cleanupError) {
          return Err(new Error(`${result.error?.message || 'Не удалось создать сообщение.'}; автоматическая очистка файла также завершилась ошибкой: ${cleanupError?.message || cleanupError}`, { cause: result.error }));
        }
        return result;
      }
      try { void this.notifyPush?.(result.value); } catch { /* best effort */ }
      this.clearReplyIfUnchanged(conversation.id, reply?.id);
      await this.refreshIfCurrent(conversation.id);
      return result;
    });
  }

  async edit(messageId, rawBody) {
    const normalized = normalizeMessageBody(rawBody);
    if (!normalized.ok) return Err(new Error(normalized.error));
    const body = normalized.body;
    const context = this.context();
    if (!context.ok) return context;
    if (!this.messageInCurrentConversation(messageId, context.value.conversation.id)) return Err(new Error('Сообщение не найдено в открытой переписке.'));
    if (this.isLocalE2EMessage(messageId)) return Err(new Error('E2E-сообщение хранится локально; изменение через старый серверный API запрещено.'));
    return this.exclusive(`message-mutation:${messageId}`, async () => {
      const result = await this.repository.update(messageId, context.value.user.id, body, context.value.conversation.id);
      if (result.ok) await this.refreshIfCurrent(context.value.conversation.id);
      return result;
    });
  }

  async remove(messageId) {
    const context = this.context();
    if (!context.ok) return context;
    if (!this.messageInCurrentConversation(messageId, context.value.conversation.id)) return Err(new Error('Сообщение не найдено в открытой переписке.'));
    if (this.isLocalE2EMessage(messageId)) return Err(new Error('E2E-сообщение хранится локально; удаление через старый серверный API запрещено.'));
    return this.exclusive(`message-mutation:${messageId}`, async () => {
      const result = await this.repository.remove(messageId, context.value.user.id, context.value.conversation.id);
      if (result.ok) await this.refreshIfCurrent(context.value.conversation.id);
      return result;
    });
  }

  async react(messageId, emoji) {
    const context = this.context();
    if (!context.ok) return context;
    if (!messageId) return Err(new Error('Не указано сообщение.'));
    const value = String(emoji ?? '').trim();
    if (!value || value.length > 16) return Err(new Error('Некорректная реакция.'));
    if (!this.messageInCurrentConversation(messageId, context.value.conversation.id)) {
      return Err(new Error('Сообщение не найдено в открытой переписке.'));
    }
    if (this.isLocalE2EMessage(messageId)) return Err(new Error('Реакции для локальных E2E-сообщений ещё не подключены.'));
    return this.exclusive(`message-react:${messageId}:${value}`, async () => {
      const result = await this.repository.react({
        messageId,
        userId: context.value.user.id,
        emoji: value
      });
      return result;
    });
  }
}
