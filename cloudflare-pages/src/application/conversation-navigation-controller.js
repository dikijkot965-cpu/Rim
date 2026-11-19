/**
 * Owns the active-conversation selection transition.
 * The legacy opener remains responsible for its established DOM rendering, while
 * this controller is the single application-level writer for active conversation
 * state and reply-target reset. Tokens prevent older navigation attempts from
 * committing after a newer selection has started.
 */
export class ConversationNavigationController {
  constructor({ getActiveConversation, setActiveConversation, setReplyTarget, onCommit, logger } = {}) {
    this.getActiveConversation = getActiveConversation || (() => null);
    this.setActiveConversation = setActiveConversation || (() => {});
    this.setReplyTarget = setReplyTarget || (() => {});
    this.onCommit = onCommit || (() => {});
    this.logger = logger;
    this.sequence = 0;
    this.disposed = false;
  }

  begin(conversationId) {
    if (this.disposed) return null;
    const sequence = ++this.sequence;
    return Object.freeze({ sequence, conversationId: String(conversationId ?? '') });
  }

  isCurrent(token) {
    return !this.disposed && Boolean(token) && token.sequence === this.sequence;
  }

  commit(token, conversation) {
    if (!this.isCurrent(token)) return false;
    if (!conversation?.id || String(conversation.id) !== token.conversationId) {
      this.logger?.warn?.('chat.navigation.commit.rejected', {
        expectedConversationId: token.conversationId,
        actualConversationId: conversation?.id ?? null
      });
      return false;
    }

    try {
      this.setActiveConversation(conversation);
      this.setReplyTarget(null);
      this.onCommit(conversation);
      return true;
    } catch (error) {
      this.logger?.error?.('chat.navigation.commit.failed', error, { conversationId: conversation.id });
      return false;
    }
  }

  invalidate() {
    this.sequence += 1;
  }

  dispose() {
    this.disposed = true;
    this.sequence += 1;
  }
}
