/**
 * Composer chrome: Enter-to-send, autosize, stickers panel, attach sheet.
 * Does not own message mutation — only input chrome.
 */
export class ComposerChromeController {
  constructor({
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    sendMessage = null,
    notify = () => {},
    logger = null
  } = {}) {
    this.document = documentRef;
    this.window = windowRef;
    this.sendMessage = sendMessage;
    this.notify = notify;
    this.logger = logger;
    this._bound = false;
  }

  messageKeydown(event) {
    if (!event) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const send = this.sendMessage || this.window?.sendMessage;
      try { void send?.(); } catch (e) { this.logger?.warn?.('composer.send.keydown', e); }
    }
  }

  resizeComposer(el) {
    const node = el || this.document?.getElementById?.('messageInput');
    if (!node) return;
    try {
      node.style.height = 'auto';
      const next = Math.min(Math.max(node.scrollHeight, 40), 160);
      node.style.height = `${next}px`;
    } catch { /* ignore */ }
  }

  toggleStickers() {
    const panel = this.document?.getElementById?.('stickerPanel');
    if (!panel) return;
    panel.classList.toggle('hidden');
  }

  openAttachSheet() {
    const doc = this.document;
    doc.getElementById?.('rimAttachSheet')?.remove?.();
    const sheet = doc.createElement('div');
    sheet.id = 'rimAttachSheet';
    sheet.className = 'rim-attach-sheet';
    sheet.innerHTML = `<div class="rim-msg-sheet-backdrop" onclick="document.getElementById('rimAttachSheet')?.remove()"></div>
    <div class="rim-attach-panel">
      <button type="button" class="rim-attach-item" data-rim-attach="photo">📷 Камера / Фото</button>
      <button type="button" class="rim-attach-item" data-rim-attach="gallery">🖼 Галерея</button>
      <button type="button" class="rim-attach-item" data-rim-attach="file">📄 Файлы</button>
      <button type="button" class="rim-attach-item" data-rim-attach="stickers">😀 Стикеры</button>
      <button type="button" class="rim-attach-item" data-rim-attach="connectors">🔌 Коннекторы</button>
      <button type="button" class="rim-attach-item" data-rim-attach="close">Закрыть</button>
    </div>`;
    sheet.addEventListener('click', (event) => {
      const btn = event.target?.closest?.('[data-rim-attach]');
      if (!btn) return;
      const action = btn.getAttribute('data-rim-attach');
      sheet.remove();
      if (action === 'photo' || action === 'gallery') {
        doc.getElementById?.('imageInput')?.click?.();
      } else if (action === 'file') {
        doc.getElementById?.('fileInput')?.click?.();
      } else if (action === 'stickers') {
        this.toggleStickers();
      } else if (action === 'connectors') {
        this.notify?.('Коннекторы — скоро будет реализовано.');
      }
    });
    doc.body.appendChild(sheet);
  }

  bindGlobals() {
    const win = this.window;
    win.__RIM_COMPOSER_CHROME_OWNED = true;
    win.messageKeydown = (event) => this.messageKeydown(event);
    win.resizeComposer = (el) => this.resizeComposer(el);
    win.toggleStickers = () => this.toggleStickers();
    win.rimOpenAttachSheet = () => this.openAttachSheet();
  }

  installDomHooks() {
    if (this._bound) return;
    this._bound = true;
    const doc = this.document;
    doc.getElementById?.('rimAttachBtn')?.addEventListener?.('click', () => this.openAttachSheet());
    doc.getElementById?.('rimVoiceBtn')?.addEventListener?.('click', () => {
      if (typeof this.window.rimStartVoiceMessage === 'function') this.window.rimStartVoiceMessage();
      else this.notify?.('Запись голосовых скоро будет доступна.');
    });
    const input = doc.getElementById?.('messageInput');
    if (input && !input.dataset.rimComposerBound) {
      input.dataset.rimComposerBound = '1';
      input.addEventListener('input', () => this.resizeComposer(input));
    }
  }

  dispose() {
    try { this.window.__RIM_COMPOSER_CHROME_OWNED = false; } catch { /* ignore */ }
  }
}
