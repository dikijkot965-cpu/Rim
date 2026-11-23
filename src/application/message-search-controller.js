import { escapeHtml } from '../core/html.js';

/** Search only the active plaintext conversation. E2E scopes fail closed. */
export class MessageSearchController {
  constructor({ repository, getConversation, timeline, documentRef = globalThis.document, windowRef = globalThis.window, logger = null } = {}) {
    this.repository = repository;
    this.getConversation = getConversation;
    this.timeline = timeline;
    this.document = documentRef;
    this.window = windowRef;
    this.logger = logger;
    this.root = null;
    this.sequence = 0;
    this.timer = null;
    this.disposed = false;
  }

  open() {
    if (this.disposed) return;
    const conversation = this.getConversation?.();
    if (!conversation?.id) { this.window?.toast?.('Сначала открой переписку.'); return; }
    this.close();
    const root = this.document.createElement('section');
    root.className = 'rim-chat-search';
    root.innerHTML = `<div class="rim-chat-search-backdrop" data-rim-search-close="1"></div>
      <div class="rim-chat-search-panel" role="dialog" aria-modal="true" aria-label="Поиск по переписке">
        <header><b>Поиск по переписке</b><button type="button" class="icon-btn" data-rim-search-close="1" aria-label="Закрыть">×</button></header>
        <input class="field" id="rimConversationSearchInput" maxlength="100" autocomplete="off" placeholder="Найти сообщение…">
        <div class="rim-chat-search-hint">Ищем только в открытой переписке. Для E2E-сообщений серверный поиск отключён.</div>
        <div class="rim-chat-search-results" id="rimConversationSearchResults"><div class="empty-state">Введите минимум два символа.</div></div>
      </div>`;
    this.document.body.append(root);
    this.root = root;
    root.addEventListener('click', event => {
      if (event.target?.closest?.('[data-rim-search-close]')) this.close();
      const hit = event.target?.closest?.('[data-rim-search-hit]');
      if (hit) void this.openHit(hit.dataset.rimSearchHit);
    });
    const input = root.querySelector('#rimConversationSearchInput');
    input?.addEventListener('input', () => this.schedule());
    input?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); this.schedule(0); } });
    input?.focus?.();
  }

  schedule(delay = 300) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.run(); }, delay);
  }

  async run() {
    if (this.disposed || !this.root) return;
    const sequence = ++this.sequence;
    const query = String(this.root.querySelector('#rimConversationSearchInput')?.value || '').trim();
    const out = this.root.querySelector('#rimConversationSearchResults');
    if (!out) return;
    if (query.length < 2) { out.innerHTML = '<div class="empty-state">Введите минимум два символа.</div>'; return; }
    out.innerHTML = '<div class="notice">Поиск…</div>';
    const conversation = this.getConversation?.();
    if (!conversation?.id) { out.innerHTML = '<div class="notice">Переписка уже закрыта.</div>'; return; }
    try {
      const result = await this.repository.searchInConversation(conversation.id, query, { limit: 30 });
      if (sequence !== this.sequence || !this.root) return;
      if (!result.ok) throw result.error;
      const rows = result.value || [];
      out.innerHTML = rows.length ? rows.map(row => `<button type="button" class="rim-chat-search-hit" data-rim-search-hit="${escapeHtml(row.id)}"><span>${escapeHtml(new Date(row.created_at).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }))}</span><b>${escapeHtml(row.body || 'Вложение')}</b></button>`).join('') : '<div class="empty-state">Совпадений не найдено.</div>';
    } catch (error) {
      if (sequence !== this.sequence || !this.root) return;
      this.logger?.warn?.('messages.search.failed', { message: error?.message || String(error) });
      out.innerHTML = `<div class="notice">${escapeHtml(error?.message || error)}</div>`;
    }
  }

  async openHit(messageId) {
    const conversation = this.getConversation?.();
    if (!conversation?.id || !messageId) return;
    const query = String(this.root?.querySelector?.('#rimConversationSearchInput')?.value || '').trim();
    const results = await this.repository.searchInConversation(conversation.id, query, { limit: 30 });
    if (!results.ok) { this.window?.toast?.(results.error?.message || 'Не удалось открыть найденное сообщение.'); return; }
    const target = (results.value || []).find(item => String(item.id) === String(messageId));
    if (!target) { this.window?.toast?.('Сообщение больше недоступно.'); return; }
    try {
      await this.timeline.loadAround(target);
      this.close();
      const selector = `.message[data-id="${this.window?.CSS?.escape ? this.window.CSS.escape(messageId) : String(messageId).replace(/[^a-zA-Z0-9_-]/g, '')}"]`;
      const node = this.document.querySelector(selector);
      node?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      node?.classList?.add('rim-search-hit-active');
      setTimeout(() => node?.classList?.remove('rim-search-hit-active'), 2200);
    } catch (error) {
      this.logger?.warn?.('messages.search.open_hit.failed', { message: error?.message || String(error) });
      this.window?.toast?.(error?.message || 'Не удалось перейти к сообщению.');
    }
  }

  close() {
    this.sequence += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.root?.remove?.();
    this.root = null;
  }

  dispose() { this.disposed = true; this.close(); }
}
