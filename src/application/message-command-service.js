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
  constructor({ repository, storage, getUser, getConversation, getReplyTarget = () => null, getTopicId = () => null, getMessages = () => [], setMessages = null, canSend = async () => true, notify = () => {}, reload = async () => {}, applyLocal = null, clearReply = () => {}, onSent = null }) {
    this.repository = repository;
    this.storage = storage;
    this.getUser = getUser;
    this.getConversation = getConversation;
    this.getReplyTarget = getReplyTarget;
    this.getTopicId = getTopicId;
    this.getMessages = getMessages;
    this.setMessages = setMessages;
    this.canSend = canSend;
    this.notify = notify;
    this.reload = reload;
    this.applyLocal = applyLocal;
    this.clearReply = clearReply;
    this.onSent = onSent;
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
        conversationId = context.value.conversation.id;
        const policy = this.assertSendPolicy(conversationId);
        if (!policy.ok) return policy;
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
      const result = await this.repository.insert({
        conversation_id: conversation.id, sender_id: user.id, body: '', sticker_id: value,
        ...(topicId ? { topic_id: topicId } : {})
      });
      if (!result.ok) return result;
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
      const path = `${user.id}/${conversation.id}/${crypto.randomUUID()}.${IMAGE_EXTENSIONS[file.type]}`;
      this.notify('Загружаю фотографию...');
      const upload = await this.storage.from('chat-files').upload(path, file, { contentType: file.type, upsert: false });
      if (upload.error) return Err(upload.error);
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
