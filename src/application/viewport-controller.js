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
    this._onOrientationChange = () => this.window.setTimeout?.(this._onUpdate, 180);
    this._onInputFocus = () => this.window.setTimeout?.(this._onUpdate, 80);
    this._onInputBlur = () => this.window.setTimeout?.(this._onUpdate, 80);
    this._input = null;
    this._installed = false;
  }

  update() {
    const win = this.window;
    const doc = this.document;
    try {
      const vv = win.visualViewport;
      const h = Math.max(240, Math.round(vv?.height || win.innerHeight || doc.documentElement?.clientHeight || 0));
      const offsetTop = Math.max(0, Math.round(vv?.offsetTop || 0));
      doc.documentElement.style.setProperty('--app-height', `${h}px`);
      doc.documentElement.style.setProperty('--app-offset-top', `${offsetTop}px`);
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
    const win = this.window;
    try {
      win.visualViewport?.removeEventListener?.('resize', this._onUpdate);
      win.visualViewport?.removeEventListener?.('scroll', this._onUpdate);
      win.removeEventListener?.('resize', this._onUpdate);
      win.removeEventListener?.('orientationchange', this._onOrientationChange);
      this._input?.removeEventListener?.('focus', this._onInputFocus);
      this._input?.removeEventListener?.('blur', this._onInputBlur);
      this.document.documentElement?.style?.removeProperty?.('--app-height');
      this.document.documentElement?.style?.removeProperty?.('--app-offset-top');
      win.__RIM_VIEWPORT_OWNED = false;
    } catch { /* ignore */ }
    this._installed = false;
    this._input = null;
  }
}
