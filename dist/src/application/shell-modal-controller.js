/**
 * Owns the global modal root contract: showModal / closeModal.
 * Keeps a single presentation surface for dialogs across the app.
 */
export class ShellModalController {
  constructor({
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    rootId = 'modalRoot'
  } = {}) {
    this.document = documentRef;
    this.window = windowRef;
    this.rootId = rootId;
  }

  #root() {
    return this.document?.getElementById?.(this.rootId) || null;
  }

  show(html) {
    const root = this.#root();
    if (!root) return false;
    root.innerHTML = `
  <div class="modal-backdrop" onclick="if(event.target===this)closeModal()">
   <div class="modal">${html || ''}</div>
  </div>`;
    return true;
  }

  close() {
    const root = this.#root();
    if (!root) return false;
    root.innerHTML = '';
    return true;
  }

  bindGlobals() {
    const win = this.window;
    win.__RIM_MODAL_OWNED = true;
    win.showModal = (html) => this.show(html);
    win.closeModal = () => this.close();
  }

  dispose() {
    try {
      this.window.__RIM_MODAL_OWNED = false;
    } catch { /* ignore */ }
  }
}
