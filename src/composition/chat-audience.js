/**
 * Composition root fragment: chat info + pinned messages.
 * Binds ChatInfoController and PinnedMessagesController to window entrypoints
 * and ownership flags. When these flags are set, legacy dual-binds must not
 * reassign the same entrypoints.
 */
import { ChatInfoController } from '../application/chat-info-controller.js';
import { PinnedMessagesController } from '../application/pinned-messages-controller.js';

/**
 * @param {object} deps
 * @param {object} deps.client
 * @param {() => object|null} deps.getUser
 * @param {(msg: string) => void} deps.notify
 * @param {object} deps.logger
 * @param {object} deps.container
 * @param {object} deps.lifecycle
 * @param {Window} [deps.windowRef]
 */
export function bindChatAudience({
  client,
  getUser,
  notify,
  logger,
  container,
  lifecycle,
  windowRef = globalThis.window
} = {}) {
  const win = windowRef;

  const chatInfo = new ChatInfoController({
    client,
    getUser,
    getActiveConversation: () => win.activeConversation || null,
    getProfiles: typeof win.getProfiles === 'function' ? (ids) => win.getProfiles(ids) : null,
    conversationTitle: typeof win.conversationTitle === 'function' ? (c) => win.conversationTitle(c) : null,
    notify,
    logger
  });
  container?.value?.('chatInfo', chatInfo);
  win.__RIM_CHAT_INFO_OWNED = true;
  win.openChatInfo = async () => {
    const result = await chatInfo.open();
    if (!result.ok && result.error?.message) notify?.(result.error.message);
    return result;
  };
  win.addGroupMember = async () => {
    const result = await chatInfo.addGroupMember();
    if (!result.ok && result.error?.message) notify?.(result.error.message);
    return result;
  };
  lifecycle?.add?.(() => { win.__RIM_CHAT_INFO_OWNED = false; });

  const pinnedMessages = new PinnedMessagesController({
    client,
    getUser,
    getActiveConversation: () => win.activeConversation || null,
    notify,
    featureError: (msg, err) => {
      if (typeof win.featureError === 'function') win.featureError(msg, err);
      else notify?.(msg);
    },
    logger
  });
  container?.value?.('pinnedMessages', pinnedMessages);
  win.__RIM_PINNED_MESSAGES_OWNED = true;
  win.openPinnedMessages = async () => {
    const result = await pinnedMessages.open();
    if (!result.ok && result.error?.message) notify?.(result.error.message);
    return result;
  };
  win.pinMessage = async messageId => {
    const user = getUser?.();
    const conversation = win.activeConversation || null;
    if (!user?.id || !conversation?.id || !messageId) {
      notify?.('Не удалось закрепить сообщение: чат или пользователь не определён.');
      return { ok: false };
    }
    const { error } = await client.from('message_pins').upsert({
      user_id: user.id,
      conversation_id: conversation.id,
      message_id: messageId
    }, { onConflict: 'user_id,message_id' });
    if (error) {
      logger?.warn?.('message.pin.failed', { message: error.message });
      notify?.('Не удалось закрепить сообщение.');
      return { ok: false, error };
    }
    notify?.('Сообщение добавлено в закреплённые.');
    return { ok: true };
  };
  lifecycle?.add?.(() => { win.__RIM_PINNED_MESSAGES_OWNED = false; });

  logger?.info?.('composition.chatAudience.bound', {});
  return { chatInfo, pinnedMessages };
}
