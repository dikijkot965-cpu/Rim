/**
 * Mobile visualViewport: --app-height and stick-to-bottom near end of messages.
 */
export class ViewportController {
  constructor({
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    logger = null
  } = {}) {
    this.document = documentRef;
    this.window = windowRef;
    this.logger = logger;
    this._onUpdate = () => this.update();
    this._installed = false;
  }

  update() {
    const win = this.window;
    const doc = this.document;
    try {
      const vv = win.visualViewport;
      const h = vv ? vv.height : win.innerHeight;
      doc.documentElement.style.setProperty('--app-height', `${h}px`);
    } catch { /* ignore */ }

    try {
      const input = doc.getElementById?.('messageInput');
      if (doc.activeElement !== input) return;
      win.requestAnimationFrame?.(() => {
        const messages = doc.getElementById?.('messages');
        if (!messages) return;
        const nearBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 120;
        if (nearBottom) messages.scrollTop = messages.scrollHeight;
      });
    } catch { /* ignore */ }
  }

  install() {
    if (this._installed) return;
    this._installed = true;
    const win = this.window;
    const doc = this.document;
    if (win.visualViewport) {
      win.visualViewport.addEventListener('resize', this._onUpdate);
      win.visualViewport.addEventListener('scroll', this._onUpdate);
    }
    win.addEventListener('resize', this._onUpdate);
    win.addEventListener('orientationchange', () => {
      win.setTimeout?.(this._onUpdate, 200);
    });
    const input = doc.getElementById?.('messageInput');
    input?.addEventListener?.('focus', () => win.setTimeout?.(this._onUpdate, 100));
    input?.addEventListener?.('blur', () => win.setTimeout?.(this._onUpdate, 100));
    this.update();
  }

  bindGlobals() {
    const win = this.window;
    win.__RIM_VIEWPORT_OWNED = true;
    win.updateViewport = () => this.update();
  }

  dispose() {
    try { this.window.__RIM_VIEWPORT_OWNED = false; } catch { /* ignore */ }
  }
}
