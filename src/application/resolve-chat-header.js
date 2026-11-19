import { displayConversationTitle, isDirectConversation } from '../domain/conversation.js';

export async function resolveChatHeader({ conversation, user, repository, logger }) {
  if (!isDirectConversation(conversation)) {
    return { title: displayConversationTitle(conversation, null), peer: null };
  }

  // The conversation list may already carry a peer profile. Use it immediately,
  // then refresh from authoritative membership/profile tables if available.
  let peer = conversation.other_profile || conversation.peer_profile || null;
  if (!peer && conversation.other_user) peer = conversation.other_user;

  try {
    if (peer?.id && typeof repository.getPeerPresence === 'function') {
      const presence = await repository.getPeerPresence(peer.id);
      if (presence.ok && presence.value) peer = { ...peer, ...presence.value };
      else if (!presence.ok) logger?.warn('chat.peer.presence.failed', { conversationId: conversation.id, message: presence.error?.message });
    } else {
      const result = await repository.getDirectPeer(conversation.id, user.id);
      if (result.ok && result.value) peer = result.value;
      else if (!result.ok) logger?.warn('chat.peer.resolve.failed', {
        conversationId: conversation.id,
        message: result.error?.message
      });
    }
  } catch (error) {
    logger?.warn('chat.peer.resolve.exception', { conversationId: conversation.id, message: error?.message });
  }

  return {
    title: displayConversationTitle(conversation, peer),
    peer
  };
}
