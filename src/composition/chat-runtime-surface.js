/**
 * Composition: in-chat runtime — receipts, decorations, list renderer, typing, presence, voice.
 */
import { ReadReceiptController } from '../application/read-receipt-controller.js';
import { MessageDecorationsController } from '../application/message-decorations-controller.js';
import { MessageListRenderer } from '../application/message-list-renderer.js';
import { TypingPresenceController } from '../application/typing-presence-controller.js';
import { OwnPresenceController } from '../application/own-presence-controller.js';
import { VoiceMessageController } from '../application/voice-message-controller.js';

/**
 * @param {object} deps
 */
export function bindChatRuntimeSurface({
  client,
  e2eScopeRepository = null,
  getUser,
  getActiveConversation,
  getMessages,
  notify,
  logger,
  container,
  lifecycle,
  documentRef = globalThis.document,
  windowRef = globalThis.window
} = {}) {
  const win = windowRef;

  const readReceipts = new ReadReceiptController({
    client,
    getUser,
    getActiveConversation,
    getMessages,
    getPreferences: () => {
      try { return JSON.parse(localStorage.getItem('rim_privacy_preferences_v1') || '{}'); }
      catch { return {}; }
    },
    logger
  });
  container?.value?.('readReceipts', readReceipts);
  win.__RIM_READ_RECEIPTS_OWNED = true;
  lifecycle?.add?.(() => { win.__RIM_READ_RECEIPTS_OWNED = false; });

  const messageDecorations = new MessageDecorationsController({
    client,
    getUser,
    getMessages,
    getActiveConversation,
    logger
  });
  container?.value?.('messageDecorations', messageDecorations);
  win.__RIM_MESSAGE_DECORATIONS_OWNED = true;
  lifecycle?.add?.(() => { win.__RIM_MESSAGE_DECORATIONS_OWNED = false; });

  const messageListRenderer = new MessageListRenderer({
    getOutboxMessages: () => {
      try {
        const convId = getActiveConversation?.()?.id;
        const userId = getUser?.()?.id;
        let outbox = null;
        try {
          if (container?.has?.('messageOutbox')) outbox = container.get('messageOutbox');
        } catch { /* ignore */ }
        outbox = outbox || win.__rimMessageOutbox || null;
        if (!outbox || !convId) return [];
        return outbox.toLocalMessages?.(convId, userId) || [];
      } catch { return []; }
    },
    client,
    getUser,
    getMessages,
    logger
  });
  container?.value?.('messageListRenderer', messageListRenderer);
  win.__rimMessageListRenderer = messageListRenderer;
  win.__RIM_MESSAGE_LIST_RENDERER_OWNED = true;
  lifecycle?.add?.(() => { win.__RIM_MESSAGE_LIST_RENDERER_OWNED = false; try { delete win.__rimMessageListRenderer; } catch {} });

  const voiceMessages = new VoiceMessageController({
    client,
    e2eScopeRepository,
    getUser,
    getActiveConversation,
    notify,
    reloadMessages: async () => { await win.loadMessages?.(); },
    moveChatToTop: (id, createdAt, preview) => {
      try { win.moveChatToTop?.(id, createdAt, preview); } catch { /* optional */ }
    },
    logger
  });
  container?.value?.('voiceMessages', voiceMessages);
  win.__RIM_VOICE_OWNED = true;
  voiceMessages.ensureButton();
  lifecycle?.add?.(() => {
    win.__RIM_VOICE_OWNED = false;
    voiceMessages.dispose();
  });
  client?.auth?.onAuthStateChange?.(event => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      setTimeout(() => voiceMessages.ensureButton(), 0);
    }
  });

  const typingPresence = new TypingPresenceController({
    client,
    getUser,
    getActiveConversation,
    logger
  });
  container?.value?.('typingPresence', typingPresence);
  win.__RIM_TYPING_PRESENCE_OWNED = true;
  typingPresence.bindInput();
  lifecycle?.add?.(() => {
    win.__RIM_TYPING_PRESENCE_OWNED = false;
    return typingPresence.dispose();
  });

  const ownPresence = new OwnPresenceController({
    client,
    getUser,
    logger
  });
  container?.value?.('ownPresence', ownPresence);
  win.__RIM_OWN_PRESENCE_OWNED = true;
  ownPresence.start();
  lifecycle?.add?.(() => {
    win.__RIM_OWN_PRESENCE_OWNED = false;
    ownPresence.dispose();
  });
  client?.auth?.onAuthStateChange?.(event => {
    if (event === 'SIGNED_OUT') ownPresence.stop();
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') ownPresence.start();
  });

  logger?.info?.('composition.chatRuntimeSurface.bound', {});
  return {
    readReceipts,
    messageDecorations,
    messageListRenderer,
    voiceMessages,
    typingPresence,
    ownPresence
  };
}
