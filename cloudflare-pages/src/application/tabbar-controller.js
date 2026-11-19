/**
 * Ensures Tools / More entries exist on the product tabbar.
 * Ported from legacy 10 — UI contract unchanged.
 */
export class TabbarController {
  constructor({ documentRef = globalThis.document, windowRef = globalThis.window } = {}) {
    this.document = documentRef;
    this.window = windowRef;
    this.observer = null;
    this.timers = [];
    this.styleEl = null;
  }

  makeButton(id, label, handler) {
    const doc = this.document;
    let el = doc.getElementById(id);
    if (!el) {
      el = doc.createElement('button');
      el.type = 'button';
      el.id = id;
      el.className = 'action-btn';
      el.textContent = label;
    }
    el.onclick = handler;
    return el;
  }

  install() {
    const doc = this.document;
    const win = this.window;
    const bar = doc.querySelector('.tabbar');
    if (!bar) return false;

    doc.getElementById('tabMore')?.remove();
    doc.getElementById('tabLocalSuite')?.remove();

    // Visual order: Чаты · Каналы · Музыка · Ещё · Инструменты
    const more = this.makeButton('tabMoreFull', 'Ещё', () => {
      if (typeof win.openMorePage === 'function') win.openMorePage();
      else if (typeof win.openMore === 'function') win.openMore();
      else console.warn('[RIM] openMore missing');
    });
    const tools = this.makeButton('tabToolsFull', 'Инструменты', () => {
      if (typeof win.openToolsPage === 'function') win.openToolsPage();
      else if (typeof win.openTools === 'function') win.openTools();
      else console.warn('[RIM] openTools missing');
    });

    if (more.parentNode !== bar) bar.appendChild(more);
    if (tools.parentNode !== bar) bar.appendChild(tools);
    // Keep Ещё immediately before Инструменты
    if (more.nextElementSibling !== tools) bar.insertBefore(more, tools);
    return true;
  }

  ensureStyle() {
    const doc = this.document;
    if (doc.getElementById('rim-final-navigation-repair')) return;
    const style = doc.createElement('style');
    style.id = 'rim-final-navigation-repair';
    style.textContent = `
  .tabbar #tabToolsFull,.tabbar #tabMoreFull{display:flex!important;visibility:visible!important;opacity:1!important;position:relative!important;flex:1 1 0!important;min-width:0!important;white-space:nowrap!important;order:initial!important;}
  .tabbar #tabMoreFull{order:4!important}
  .tabbar #tabToolsFull{order:5!important}
  #rimFullPage .rim-banner img,.rim-fullpage .rim-banner img{max-height:125px!important;height:auto!important;object-fit:contain!important}
  #rimFullPage .rim-banner,.rim-fullpage .rim-banner{max-height:165px!important;overflow:hidden!important}
 `;
    (doc.head || doc.documentElement).appendChild(style);
    this.styleEl = style;
  }

  start() {
    this.ensureStyle();
    this.install();
    const doc = this.document;
    if (!this.observer && doc.documentElement) {
      this.observer = new MutationObserver(() => this.install());
      this.observer.observe(doc.documentElement, { childList: true, subtree: true });
    }
    for (const ms of [0, 100, 400, 1000, 2000, 4000]) {
      this.timers.push(setTimeout(() => this.install(), ms));
    }
    this.window.addEventListener?.('load', this._onLoad);
  }

  _onLoad = () => { this.install(); };

  dispose() {
    this.observer?.disconnect?.();
    this.observer = null;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    try { this.window.removeEventListener?.('load', this._onLoad); } catch { /* ignore */ }
  }
}
