import { escapeHtml } from '../core/html.js';
/**
 * Full-page overlays for More / Tools / secondary shells.
 * Restores fullPage/rimClosePage/setNavActive lost when legacy 05 left the HTML.
 * Uses existing .rim-fullpage CSS contract — no visual redesign.
 */
export class ShellPageController {
  constructor({ documentRef = globalThis.document, windowRef = globalThis.window } = {}) {
    this.document = documentRef;
    this.window = windowRef;
  }

  setNavActive(which) {
    const doc = this.document;
    const map = {
      chats: 'tabChats',
      channels: 'tabChannels',
      music: 'tabMusic',
      more: 'tabMoreFull',
      tools: 'tabToolsFull'
    };
    ['tabChats', 'tabChannels', 'tabMusic', 'tabMoreFull', 'tabToolsFull'].forEach(id => {
      doc.getElementById(id)?.classList.toggle('selected', id === map[which]);
    });
    // Also toggle legacy-selected class used by primary tabs
    ['chats', 'channels', 'music'].forEach(name => {
      const el = doc.getElementById('tab' + name[0].toUpperCase() + name.slice(1));
      el?.classList.toggle('selected', name === which);
    });
  }

  closePage() {
    this.document.getElementById('rimFullPage')?.remove();
  }

  fullPage(title, body) {
    this.closePage();
    const main = this.document.querySelector('.main') || this.document.body;
    const root = this.document.createElement('section');
    root.className = 'rim-fullpage';
    root.id = 'rimFullPage';
    root.innerHTML = `<header class="rim-page-head"><button type="button" class="icon-btn" data-rim-close-page>‹</button><div class="rim-page-title">${escapeHtml(title)}</div><button type="button" class="icon-btn rim-floating-close" data-rim-close-page>×</button></header><div class="rim-page-body">${body}</div>`;
    main.appendChild(root);
    root.querySelectorAll('[data-rim-close-page]').forEach(btn => {
      btn.addEventListener('click', () => this.closePage());
    });
    return root;
  }

  bindGlobals() {
    const win = this.window;
    win.fullPage = (title, body) => this.fullPage(title, body);
    win.rimClosePage = () => this.closePage();
    win.closePage = () => this.closePage();
    win.setNavActive = which => this.setNavActive(which);
    win.__RIM_SHELL_PAGE_OWNED = true;
  }

  dispose() {
    try {
      this.window.__RIM_SHELL_PAGE_OWNED = false;
    } catch { /* ignore */ }
  }
}
