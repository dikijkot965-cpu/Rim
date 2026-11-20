import { ProfileRepository } from '../infrastructure/supabase/profile-repository.js';
/**
 * Composition: conversation list, state projection, and chat shell chrome.
 */
import { ConversationListController } from '../application/conversation-list-controller.js';
import { ConversationStateController } from '../application/conversation-state-controller.js';
import { ConversationShellController } from '../application/conversation-shell-controller.js';

/**
 * @param {object} deps
 */
export function bindConversationSessionSurface({
  repository,
  client,
  getConversations,
  setConversations,
  getUser,
  getActiveConversation,
  getMessages,
  avatarUrlFor,
  notify,
  logger,
  container,
  lifecycle,
  windowRef = globalThis.window
} = {}) {
  const win = windowRef;

  const conversationList = new ConversationListController({
    repository,
    getConversations,
    setConversations,
    getUser,
    getActiveConversation,
    avatarUrlFor,
    logger,
    notify
  });
  container?.value?.('conversationList', conversationList);
  win.__RIM_CONVERSATION_LIST_RENDER_OWNED = true;
  let profileRepository = null;
  if (client) {
    profileRepository = new ProfileRepository(client);
    try {
      if (container && !container.has?.('profileRepository')) {
        container.value?.('profileRepository', profileRepository);
      }
    } catch { /* ignore */ }
  } else if (container?.has?.('profileRepository')) {
    try { profileRepository = container.get('profileRepository'); } catch { /* ignore */ }
  }
  win.getProfiles = async (ids) => {
    if (!profileRepository) return {};
    const result = await profileRepository.getByIds(ids);
    return result.ok ? result.value : {};
  };
  win.__RIM_FAVORITES_ROW_OWNED = true;
  lifecycle?.add?.(() => {
    win.__RIM_FAVORITES_ROW_OWNED = false;
    win.__RIM_CONVERSATION_LIST_RENDER_OWNED = false;
    conversationList.invalidate?.();
  });

  const conversationState = new ConversationStateController({
    repository,
    client,
    getConversations,
    getUser,
    getActiveConversation,
    getMessages,
    renderList: () => win.renderConversationList?.(),
    logger
  });
  container?.value?.('conversationState', conversationState);
  lifecycle?.add?.(() => conversationState.stopRealtime?.());

  const conversationShell = new ConversationShellController({
    client,
    logger
  });
  container?.value?.('conversationShell', conversationShell);
  win.__RIM_CONVERSATION_SHELL_OWNED = true;
  win.rimApplyConversationShell = (conversation, options) =>
    conversationShell.applyAfterSelection(conversation, options);
  lifecycle?.add?.(() => {
    win.__RIM_CONVERSATION_SHELL_OWNED = false;
    conversationShell.dispose?.();
  });

  logger?.info?.('composition.conversationSessionSurface.bound', {});
  return { conversationList, conversationState, conversationShell };
}
