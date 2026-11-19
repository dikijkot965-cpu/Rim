export class FavoritesWorkspace {
  constructor({ db, getUser, writer, logger }) { this.db = db; this.getUser = getUser; this.writer = writer; this.logger = logger; this.root = null; this.tab = 'notes'; }
  mount() {
    if (!this.root) { this.root = document.createElement('div'); this.root.id = 'rimFavoritesWorkspace'; this.root.className = 'rim-workspace-overlay'; document.body.append(this.root); }
    this.renderShell(); this.openTab('notes');
  }
  renderShell() {
    this.root.innerHTML = `<section class="rim-favorites-app"><header class="rim-favorites-head"><div><div class="rim-favorites-kicker">ЛИЧНОЕ ПРОСТРАНСТВО</div><h1>⭐ Избранное</h1><p>Сохранённое, документы и пересланные сюда сообщения</p></div><button class="icon-btn" data-close aria-label="Закрыть">×</button></header><nav class="rim-favorites-tabs"><button data-tab="notes" class="active">Заметки</button><button data-tab="writer">Lite Writer</button><button data-tab="messages">Сообщения из РИМа</button></nav><main class="rim-favorites-content" id="rimFavoritesContent"><div class="loading">Загрузка…</div></main></section>`;
    this.root.querySelector('[data-close]').addEventListener('click', () => this.close());
    this.root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => this.openTab(b.dataset.tab)));
  }
  close() { this.root?.remove(); this.root = null; }
  async openTab(tab) {
    this.tab = tab; this.root?.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    const out = this.root?.querySelector('#rimFavoritesContent'); if (!out) return;
    if (tab === 'writer') { out.innerHTML = `<div class="rim-writer-launch"><div class="rim-writer-launch-icon">✒</div><h2>Lite Writer</h2><p>Полноэкранный текстовый редактор. Панель инструментов доступна по отдельной кнопке внутри редактора.</p><button class="primary-btn" id="rimLaunchWriter">Открыть редактор</button></div>`; out.querySelector('#rimLaunchWriter').addEventListener('click', () => { this.close(); if (typeof window.rimOpenWriter === 'function') window.rimOpenWriter(); else this.logger.warn('writer.not.available'); }); return; }
    const user = this.getUser(); if (!user) { out.textContent = 'Войдите в аккаунт.'; return; }
    out.innerHTML = '<div class="loading">Загрузка…</div>';
    const types = tab === 'notes' ? ['text','link'] : ['message'];
    const { data, error } = await this.db.from('rim_favorite_items').select('id,item_type,title,body,metadata,created_at').eq('user_id', user.id).in('item_type', types).order('created_at', { ascending: false }).limit(200);
    if (error) { this.logger.error('favorites.load.failed', error); out.textContent = 'Не удалось загрузить материалы. Повторите попытку.'; return; }
    if (tab === 'notes') this.renderNotes(out, data || []); else this.renderMessages(out, data || []);
  }
  renderNotes(out, rows) {
    out.innerHTML = `<form class="rim-favorite-note-form"><input class="field" name="title" maxlength="160" placeholder="Название заметки"><textarea class="field" name="body" rows="4" maxlength="20000" placeholder="Текст заметки или ссылка"></textarea><button class="primary-btn">＋ Сохранить заметку</button></form><div class="rim-favorite-items">${rows.map(x => `<article class="rim-favorite-item"><header><b>${this.escape(x.title || 'Заметка')}</b><time>${new Date(x.created_at).toLocaleString('ru-RU')}</time></header><div>${this.escape(x.body || '')}</div><button class="action-btn danger-btn" data-delete="${x.id}">Удалить</button></article>`).join('') || '<div class="empty-state">Заметок пока нет.</div>'}</div>`;
    out.querySelector('form').addEventListener('submit', async e => { e.preventDefault(); const fd = new FormData(e.currentTarget); const body = String(fd.get('body') || '').trim(); if (!body) return; const { error } = await this.db.from('rim_favorite_items').insert({ user_id: this.getUser().id, item_type: /^https?:\/\//i.test(body) ? 'link' : 'text', title: String(fd.get('title') || '').trim() || 'Заметка', body, metadata: {} }); if (error) { this.logger.error('favorites.save.failed', error); alert('Не удалось сохранить заметку.'); return; } await this.openTab('notes'); });
    out.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', async () => { if (!confirm('Удалить заметку?')) return; const { error } = await this.db.from('rim_favorite_items').delete().eq('id', b.dataset.delete).eq('user_id', this.getUser().id); if (error) { this.logger.error('favorites.delete.failed', error); alert('Не удалось удалить заметку.'); return; } await this.openTab('notes'); }));
  }
  renderMessages(out, rows) {
    out.innerHTML = `<div class="rim-favorite-items">${rows.map(x => `<article class="rim-favorite-item"><header><b>${this.escape(x.title || 'Сохранённое сообщение')}</b><time>${new Date(x.created_at).toLocaleString('ru-RU')}</time></header><div>${this.escape(x.body || '')}</div><button class="action-btn danger-btn" data-delete="${x.id}">Убрать из избранного</button></article>`).join('') || '<div class="empty-state">Здесь появятся сообщения, которые вы сохраните из переписок.</div>'}</div>`;
    out.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', async () => { const { error } = await this.db.from('rim_favorite_items').delete().eq('id', b.dataset.delete).eq('user_id', this.getUser().id); if (error) { this.logger.error('favorites.message.delete.failed', error); return; } await this.openTab('messages'); }));
  }
  async saveMessage(message) {
    const user = this.getUser(); if (!user || !message?.id) return;
    const { error } = await this.db.from('rim_favorite_items').insert({ user_id: user.id, item_type: 'message', title: 'Сообщение из РИМа', body: message.body || '', metadata: { message_id: message.id, conversation_id: message.conversation_id, sender_id: message.sender_id, created_at: message.created_at } });
    if (error) { this.logger.error('favorites.message.save.failed', error); alert('Не удалось сохранить сообщение.'); return; }
    alert('Сообщение сохранено в Избранное.');
  }
  escape(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
}
