import { Err, Ok } from '../core/result.js';

/**
 * Explicit sign-out boundary: auth revoke + local state wipe + screen swap.
 * Realtime channel teardown is delegated via onBeforeSignOut hooks.
 */
export class SessionLifecycleService {
  constructor({
    client,
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    notify = () => {},
    onBeforeSignOut = async () => {},
    onAfterSignOut = async () => {},
    logger = null
  } = {}) {
    this.client = client;
    this.document = documentRef;
    this.window = windowRef;
    this.notify = notify;
    this.onBeforeSignOut = onBeforeSignOut;
    this.onAfterSignOut = onAfterSignOut;
    this.logger = logger;
    this.inFlight = false;
  }

  async signOut() {
    if (this.inFlight) return Err(new Error('Выход уже выполняется.'));
    this.inFlight = true;
    try {
      try { await this.onBeforeSignOut(); } catch (error) {
        this.logger?.warn?.('session.beforeSignOut.failed', { message: error?.message });
      }

      // Best-effort legacy channel cleanup if globals still exist.
      try {
        const db = this.client;
        if (this.window?.realtimeChannel) {
          await db.removeChannel?.(this.window.realtimeChannel);
          this.window.realtimeChannel = null;
        }
        if (this.window?.reactionChannel) {
          await db.removeChannel?.(this.window.reactionChannel);
          this.window.reactionChannel = null;
        }
      } catch { /* ignore */ }

      const { error } = await this.client.auth.signOut();
      if (error) throw error;

      try { this.window.currentUser = null; } catch { /* ignore */ }
      try { this.window.currentProfile = null; } catch { /* ignore */ }
      try { this.window.conversations = []; } catch { /* ignore */ }
      try { this.window.activeConversation = null; } catch { /* ignore */ }
      try { this.window.messagesCache = []; } catch { /* ignore */ }
      try { this.window.replyTarget = null; } catch { /* ignore */ }

      const app = this.document.getElementById('app');
      const auth = this.document.getElementById('authScreen');
      if (app) app.classList.add('hidden');
      if (auth) auth.classList.remove('hidden');
      const status = this.document.getElementById('authStatus');
      if (status) status.textContent = 'Вы вышли из аккаунта.';

      try { await this.onAfterSignOut(); } catch (error) {
        this.logger?.warn?.('session.afterSignOut.failed', { message: error?.message });
      }
      return Ok(true);
    } catch (error) {
      this.logger?.warn?.('session.signOut.failed', { message: error?.message });
      this.notify(`Не удалось завершить сеанс: ${error?.message || 'неизвестная ошибка'}`);
      return Err(error);
    } finally {
      this.inFlight = false;
    }
  }
}
