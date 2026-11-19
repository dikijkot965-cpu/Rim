/**
 * Owns the authenticated user's last_seen_at heartbeat.
 * Independent of peer presence / typing (TypingPresenceController).
 */
export class OwnPresenceController {
  constructor({
    client,
    getUser,
    logger = null,
    intervalMs = 60000,
    documentRef = globalThis.document
  } = {}) {
    this.client = client;
    this.getUser = getUser;
    this.logger = logger;
    this.intervalMs = intervalMs;
    this.document = documentRef;
    this.timer = null;
    this.busy = false;
    this.disposed = false;
    this.visibilityHandler = null;
  }

  async touch() {
    if (this.disposed || this.busy) return;
    const user = this.getUser?.();
    if (!this.client || !user?.id) return;
    if (this.document?.visibilityState === 'hidden') return;

    this.busy = true;
    try {
      const { error } = await this.client
        .from('profiles')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) this.logger?.warn?.('presence.own.touch.failed', { message: error.message });
    } catch (error) {
      this.logger?.warn?.('presence.own.touch.failed', { message: error?.message });
    } finally {
      this.busy = false;
    }
  }

  start() {
    if (this.disposed) return;
    this.stopTimerOnly();
    void this.touch();
    this.timer = setInterval(() => { void this.touch(); }, this.intervalMs);
    if (this.document && !this.visibilityHandler) {
      this.visibilityHandler = () => {
        if (this.document.visibilityState === 'visible') void this.touch();
      };
      this.document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  stopTimerOnly() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  stop() {
    this.stopTimerOnly();
    if (this.document && this.visibilityHandler) {
      this.document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  dispose() {
    this.disposed = true;
    this.stop();
  }
}
