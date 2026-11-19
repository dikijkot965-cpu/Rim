/**
 * Coordinates the asynchronous lifecycle around the legacy conversation opener.
 * The legacy renderer remains the source of truth for DOM construction; this
 * controller owns pre-navigation cleanup and latest-request-only side effects.
 */
export class ConversationOpenCoordinator {
  constructor({ beforeOpen = async () => true, afterOpen = async () => {}, logger } = {}) {
    this.beforeOpen = beforeOpen;
    this.afterOpen = afterOpen;
    this.logger = logger;
    this.sequence = 0;
    this.disposed = false;
  }

  isCurrent(sequence) {
    return !this.disposed && sequence === this.sequence;
  }

  async open({ id, original, receiver, args = [] }) {
    if (this.disposed) return undefined;
    if (typeof original !== 'function') throw new TypeError('Conversation opener must be a function');

    const sequence = ++this.sequence;
    const context = { id, sequence };

    let canContinue;
    try {
      canContinue = await this.beforeOpen(context);
    } catch (error) {
      this.logger?.error?.('chat.open.preflight.failed', error, { conversationId: id, sequence });
      return undefined;
    }
    if (canContinue === false || !this.isCurrent(sequence)) return undefined;

    // Do not swallow errors from the original opener: callers retain its contract.
    const result = await original.apply(receiver, [id, ...args]);
    if (!this.isCurrent(sequence)) return result;

    try {
      await this.afterOpen({ ...context, result, isCurrent: () => this.isCurrent(sequence) });
    } catch (error) {
      this.logger?.error?.('chat.open.after.failed', error, { conversationId: id, sequence });
    }
    return result;
  }

  invalidate() {
    this.sequence += 1;
  }

  dispose() {
    this.disposed = true;
    this.sequence += 1;
  }
}
