/**
 * Composition: conversation navigation tokens + modular open path + coordinator wrap.
 */
import { ConversationNavigationController } from '../application/conversation-navigation-controller.js';
import { ConversationOpenService } from '../application/conversation-open-service.js';
import { ConversationOpenCoordinator } from '../application/conversation-open-coordinator.js';
import { paintDirectPeerHeader } from '../application/paint-direct-peer-header.js';

/**
 * @param {object} deps
 */
export function bindConversationOpenSurface({
  repository,
  conversationShell,
  getUser,
  getConversations,
  setConversations,
  getActiveConversation,
  setActiveConversation,
  setReplyTarget,
  resolveChatHeader,
  applyPeerAvatar,
  getHeaderSequence,
  setHeaderSequence,
  onBeforeOpen = async () => true,
  afterBindings = async () => {},
  readReceipts,
  typingPresence,
  events,
  context,
  legacy,
  logger,
  container,
  lifecycle,
  entrypoints,
  documentRef = globalThis.document,
  windowRef = globalThis.window
} = {}) {
  const win = windowRef;

  const conversationNavigation = new ConversationNavigationController({
    getActiveConversation,
    setActiveConversation,
    setReplyTarget,
    onCommit: () => win.cancelReply?.(),
    logger
  });
  container?.value?.('conversationNavigation', conversationNavigation);
  win.rimBeginConversationNavigation = id => conversationNavigation.begin(id);
  win.rimIsConversationNavigationCurrent = token => conversationNavigation.isCurrent(token);
  win.rimCommitConversationSelection = (token, conversation) =>
    conversationNavigation.commit(token, conversation);
  lifecycle?.add?.(() => conversationNavigation.dispose());
  legacy?.db?.auth?.onAuthStateChange?.(event => {
    if (event === 'SIGNED_OUT') conversationNavigation.invalidate();
  });

  const conversationOpenService = new ConversationOpenService({
    getUser,
    getConversations,
    setConversations,
    resolveConversation: async (conversationId, userId) => {
      if (typeof win.rimResolveConversationForOpen === 'function') {
        return win.rimResolveConversationForOpen(conversationId, userId);
      }
      const result = await repository.getAccessibleConversation(conversationId, userId);
      if (!result.ok) throw result.error;
      return result.value;
    },
    beginNavigation: id => conversationNavigation.begin(id),
    isNavigationCurrent: token => conversationNavigation.isCurrent(token),
    commitSelection: (token, conversation) => conversationNavigation.commit(token, conversation),
    shell: conversationShell,
    loadMessages: async () => {
      if (typeof win.rimLoadMessagesStable === 'function') return win.rimLoadMessagesStable();
      if (typeof win.loadMessages === 'function') return win.loadMessages();
    },
    subscribeMessages: () => { win.subscribeToMessages?.(); },
    markRead: async () => { await win.markConversationRead?.(); },
    cancelReply: () => win.cancelReply?.(),
    notify: message => legacy?.notify?.(message),
    trackOpen: async payload => {
      try { await win.rimTrackEvent?.('conversation_open', payload); } catch { /* ignore */ }
    },
    documentRef,
    windowRef: win,
    logger
  });
  container?.value?.('conversationOpenService', conversationOpenService);
  win.__RIM_MODULAR_OPEN_IMPL = (id, ...args) => conversationOpenService.open(id);

  const conversationOpen = new ConversationOpenCoordinator({
    beforeOpen: async ({ sequence }) => {
      if (typeof setHeaderSequence === 'function') setHeaderSequence(sequence);
      return onBeforeOpen({ sequence });
    },
    afterOpen: async ({ id, sequence, isCurrent }) => {
      if (!isCurrent()) return;
      try {
        const app = documentRef?.getElementById?.('app') || win.document?.getElementById?.('app');
        app?.classList.add('rim-chat-focus');
        documentRef?.getElementById?.('chatWindow')?.classList.add('open', 'mobile-active');
      } catch { /* ignore */ }
      const activeAfterOpen = getActiveConversation?.();
      if (activeAfterOpen) {
        conversationShell?.applyAfterSelection?.(activeAfterOpen, { isCurrent });
      }
      await readReceipts?.bind?.(activeAfterOpen?.id || null);
      if (!isCurrent()) return;
      if (activeAfterOpen) await typingPresence?.bind?.(activeAfterOpen);
      if (!isCurrent()) return;

      await afterBindings?.({ id, sequence, isCurrent, activeAfterOpen });

      const state = context?.getActiveConversation?.() || getActiveConversation?.();
      if (state) events?.emit?.('conversation.opened', { conversation: state });
      if (state?.type !== 'direct') return;
      const resolved = await paintDirectPeerHeader({
        conversation: state,
        user: getUser?.(),
        repository,
        resolveChatHeader,
        applyPeerAvatar,
        documentRef,
        isCurrent: () =>
          isCurrent() &&
          String((context?.getActiveConversation?.() || getActiveConversation?.())?.id) === String(state.id),
        sequence,
        logger
      });
      if (resolved && isCurrent()) {
        events?.emit?.('chat.opened', { conversation: state, peer: resolved.peer });
      }
    },
    logger
  });
  container?.value?.('conversationOpen', conversationOpen);
  lifecycle?.add?.(() => conversationOpen.dispose());

  win.__RIM_OPEN_CONVERSATION_OWNED = true;
  entrypoints?.wrap?.('openConversation', original => function (id, ...args) {
    const modular = typeof win.__RIM_MODULAR_OPEN_IMPL === 'function'
      ? win.__RIM_MODULAR_OPEN_IMPL
      : original;
    return conversationOpen.open({ id, original: modular, receiver: this, args });
  });
  lifecycle?.add?.(() => {
    win.__RIM_OPEN_CONVERSATION_OWNED = false;
    try { delete win.__RIM_MODULAR_OPEN_IMPL; } catch { win.__RIM_MODULAR_OPEN_IMPL = undefined; }
  });

  
  const appEl = () => documentRef?.getElementById?.('app') || win.document?.getElementById?.('app');
  const prevBack = win.backToChats;
  win.__RIM_BACK_TO_CHATS_OWNED = true;
  win.backToChats = (...a) => {
    try { appEl()?.classList.remove('rim-chat-focus'); } catch {}
    return typeof prevBack === 'function' ? prevBack(...a) : undefined;
  };
  // After modular open, focus chat chrome
  const markFocus = () => { try { appEl()?.classList.add('rim-chat-focus'); } catch {} };
  win.__rimMarkChatFocus = markFocus;
logger?.info?.('composition.conversationOpenSurface.bound', {});
  return { conversationNavigation, conversationOpenService, conversationOpen };
}
