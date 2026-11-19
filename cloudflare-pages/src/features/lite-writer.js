/**
 * RIM Lite Writer — isolated feature module.
 * Keeps the existing imperial workspace shell while removing the runtime dependency on Quill/CDN.
 * Supabase is the primary store; versioned local storage is a resilient fallback.
 */
const ALLOWED_TAGS = new Set(['P','DIV','BR','B','STRONG','I','EM','U','S','STRIKE','H1','H2','H3','UL','OL','LI','BLOCKQUOTE','A','PRE','CODE']);

function sanitizeHtml(input) {
  const doc = new DOMParser().parseFromString(String(input || ''), 'text/html');
  const walk = node => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 1) {
        if (!ALLOWED_TAGS.has(child.tagName)) {
          child.replaceWith(...child.childNodes);
          continue;
        }
        for (const attr of [...child.attributes]) {
          if (child.tagName === 'A' && attr.name === 'href') {
            try {
              const url = new URL(attr.value, location.href);
              if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) child.removeAttribute('href');
              else child.setAttribute('href', url.href);
            } catch { child.removeAttribute('href'); }
          } else if (attr.name === 'style' && /^(color|background-color):\s*(#[0-9a-f]{3,8}|rgba?\([0-9.,%\s]+\)|[a-z]{3,20});?$/i.test(attr.value.trim())) {
            // retain simple text colour formatting only
          } else child.removeAttribute(attr.name);
        }
        walk(child);
      } else if (child.nodeType !== 3) child.remove();
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localKey = userId => `rim.lite-writer.v3:${userId}`;

export class LiteWriterWorkspace {
  constructor({ db, getUser, logger }) {
    this.db = db;
    this.getUser = getUser;
    this.logger = logger;
    this.root = null;
    this.docs = [];
    this.activeId = null;
    this.timer = null;
    this.loading = false;
    this.mode = 'cloud';
    this.saveChain = Promise.resolve();
    this.generation = 0;
  }

  async open() {
    const user = this.getUser();
    if (!user) throw new Error('Войдите в аккаунт, чтобы открыть Lite Writer.');
    this.generation++;
    const generation = this.generation;
    this.mount();
    this.setStatus('Загружаем документы…');
    try {
      const { data, error } = await this.db.from('rim_writer_documents')
        .select('id,title,content,folder,updated_at,created_at')
        .eq('user_id', user.id).order('updated_at', { ascending: false }).limit(300);
      if (error) throw error;
      if (generation !== this.generation) return;
      this.docs = data || [];
      this.mode = 'cloud';
      const localDrafts = this.readLocal(user.id).filter(item => String(item.id || '').startsWith('local-'));
      const stillLocal = [];
      for (const draft of localDrafts) {
        const { data: migrated, error: migrateError } = await this.db.from('rim_writer_documents')
          .insert({ user_id: user.id, title: draft.title || 'Без названия', content: draft.content || '', folder: draft.folder || 'Основное' })
          .select('id,title,content,folder,updated_at,created_at').single();
        if (migrateError) stillLocal.push(draft);
        else this.docs.push(migrated);
      }
      this.docs.push(...stillLocal);
      this.writeLocal(user.id, stillLocal);
      this.docs.sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
      this.setStatus('Синхронизация с аккаунтом');
    } catch (error) {
      this.logger?.warn?.('writer.cloud.unavailable', { message: error?.message });
      this.mode = 'local';
      this.docs = this.readLocal(user.id);
      this.setStatus('Локальный режим · облачная таблица недоступна');
    }
    if (generation !== this.generation || !this.root?.isConnected) return;
    this.activeId = this.docs[0]?.id ?? null;
    this.renderDocs();
    this.loadActive();
    this.bind();
  }

  mount() {
    document.getElementById('rimWorkspaceOverlay')?.remove();
    const host = document.getElementById('chatWindow');
    if (!host) throw new Error('Окно редактора не найдено.');
    const root = document.createElement('section');
    root.id = 'rimWorkspaceOverlay';
    root.className = 'rim-workspace-overlay';
    root.innerHTML = `
      <header class="rim-workspace-head">
        <button class="icon-btn" type="button" data-back title="Назад">‹</button>
        <div class="grow"><h2>Lite Writer</h2></div>
        <button class="action-btn rim-writer-mobile-docs" type="button" data-docs>Документы</button>
        <button class="action-btn" type="button" data-new>＋ Новый</button>
        <button class="primary-btn" type="button" data-save>Сохранить</button>
        <button class="icon-btn" type="button" data-tools title="Ещё">⋯</button>
      </header>
      <div class="rim-writer-shell" id="rimWriterShell">
        <aside class="rim-writer-docs" id="rimWriterDocs" aria-label="Документы"></aside>
        <main class="rim-writer-main">
          <div class="rim-writer-titlebar">
            <input id="rimWriterTitle" maxlength="160" placeholder="Название документа" aria-label="Название документа">
            <span class="rim-writer-state" id="rimWriterStatus">Открываем…</span>
          </div>
          <div class="rim-writer-toolbar" id="rimWriterToolbar" role="toolbar" aria-label="Форматирование">
            <button type="button" data-command="bold"><b>B</b></button>
            <button type="button" data-command="italic"><i>I</i></button>
            <button type="button" data-command="underline"><u>U</u></button>
            <button type="button" data-command="strikeThrough"><s>S</s></button>
            <button type="button" data-command="formatBlock" data-value="H1">H1</button>
            <button type="button" data-command="formatBlock" data-value="H2">H2</button>
            <button type="button" data-command="formatBlock" data-value="P">¶</button>
            <button type="button" data-command="insertUnorderedList">• Список</button>
            <button type="button" data-command="insertOrderedList">1. Список</button>
            <button type="button" data-command="formatBlock" data-value="BLOCKQUOTE">❝</button>
            <button type="button" data-link>Ссылка</button>
            <button type="button" data-command="removeFormat">Очистить</button>
          </div>
          <div class="rim-writer-paper-wrap">
            <div class="rim-writer-paper">
              <div id="rimWriterEditor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Текст документа" spellcheck="true" data-placeholder="Начните писать…"></div>
            </div>
          </div>
          <footer class="rim-writer-footer"><span>Автосохранение включено</span><span id="rimWriterCount">0 слов · 0 символов</span></footer>
        </main>
      </div>`;
    host.append(root);
    host.classList.add('open', 'mobile-active');
    document.getElementById('sidebar')?.classList.add('mobile-hidden');
    this.root = root;
    this.installStyles();
  }

  installStyles() {
    if (document.getElementById('rim-lite-writer-v30-css')) return;
    const style = document.createElement('style');
    style.id = 'rim-lite-writer-v30-css';
    style.textContent = `
      #rimWriterToolbar{display:flex;flex-wrap:wrap;gap:4px;padding:8px 12px;background:var(--panel);border-bottom:1px solid var(--border)}
      #rimWriterToolbar button{min-height:30px;padding:5px 9px;border:1px solid var(--border);border-radius:7px;background:var(--panel2);color:var(--text);font-size:12px}
      #rimWriterToolbar button:active{background:var(--gold);color:#17130e}
      #rimWriterEditor{min-height:65vh;outline:none;color:#252525;background:#fff;font:17px/1.72 Georgia,'Times New Roman',serif;overflow-wrap:anywhere}
      #rimWriterEditor:empty:before{content:attr(data-placeholder);color:#999;pointer-events:none}
      #rimWriterEditor h1{font-size:2em}#rimWriterEditor h2{font-size:1.55em}#rimWriterEditor blockquote{border-left:3px solid #b79b63;padding-left:14px;color:#555;margin-left:0}
      #rimWriterEditor a{color:#245b9a;text-decoration:underline}
      .rim-writer-docs{overflow:auto}.rim-writer-doc{width:100%;text-align:left;background:transparent;color:var(--text);border:1px solid transparent}
      .rim-writer-doc.active{border-color:var(--gold)}.rim-writer-paper{background:#fff!important;color:#252525!important}
      @media(max-width:700px){#rimWriterToolbar{max-height:110px;overflow:auto;padding:6px}.rim-writer-paper{min-height:100%;padding:20px 16px!important}#rimWriterEditor{min-height:68vh;font-size:16px}}
    `;
    document.head.append(style);
  }

  bind() {
    const root = this.root;
    root.querySelector('[data-back]').addEventListener('click', () => this.back());
    root.querySelector('[data-new]').addEventListener('click', () => this.newDocument());
    root.querySelector('[data-save]').addEventListener('click', () => this.save());
    root.querySelector('[data-docs]').addEventListener('click', () => document.getElementById('rimWriterShell')?.classList.toggle('docs-open'));
    root.querySelector('[data-tools]').addEventListener('click', () => document.getElementById('rimWriterShell')?.classList.toggle('tools-open'));
    root.querySelector('#rimWriterTitle').addEventListener('input', () => this.schedule());
    root.querySelector('#rimWriterEditor').addEventListener('input', () => { this.updateCount(); this.schedule(); });
    root.querySelector('#rimWriterToolbar').addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-link')) {
        const raw = prompt('Адрес ссылки (https://…)');
        if (!raw) return;
        try {
          const url = new URL(raw);
          if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
          document.execCommand('createLink', false, url.href);
        } catch { this.setStatus('Укажите корректную ссылку http:// или https://'); }
        return;
      }
      const command = button.dataset.command;
      if (!command) return;
      document.execCommand(command, false, button.dataset.value || null);
      this.root.querySelector('#rimWriterEditor').focus();
      this.schedule();
    });
  }

  renderDocs() {
    const out = this.root?.querySelector('#rimWriterDocs');
    if (!out) return;
    out.innerHTML = this.docs.map(doc => `<button type="button" class="rim-writer-doc ${doc.id === this.activeId ? 'active' : ''}" data-id="${escapeHtml(doc.id)}"><b>${escapeHtml(doc.title || 'Без названия')}</b><small>${doc.updated_at ? new Date(doc.updated_at).toLocaleDateString('ru-RU') : ''}</small></button>`).join('') || '<div class="rim-update-muted" style="padding:10px">Документов пока нет. Создайте первый документ.</div>';
    out.querySelectorAll('[data-id]').forEach(button => button.addEventListener('click', () => this.select(button.dataset.id)));
  }

  loadActive() {
    const doc = this.docs.find(item => String(item.id) === String(this.activeId));
    const title = this.root?.querySelector('#rimWriterTitle');
    const editor = this.root?.querySelector('#rimWriterEditor');
    if (title) title.value = doc?.title || '';
    if (editor) editor.innerHTML = sanitizeHtml(doc?.content || '');
    this.updateCount();
  }

  updateCount() {
    const text = this.root?.querySelector('#rimWriterEditor')?.innerText || '';
    const words = (text.trim().match(/\S+/g) || []).length;
    const count = this.root?.querySelector('#rimWriterCount');
    if (count) count.textContent = `${words} слов · ${text.length} символов`;
  }

  setStatus(message) {
    const node = this.root?.querySelector('#rimWriterStatus');
    if (node) node.textContent = message;
  }

  schedule() {
    if (this.loading) return;
    clearTimeout(this.timer);
    this.setStatus('Есть несохранённые изменения');
    this.timer = setTimeout(() => this.save(), 900);
  }

  readLocal(userId) {
    try {
      const value = JSON.parse(localStorage.getItem(localKey(userId)) || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  writeLocal(userId, documents = this.docs) {
    try {
      if (!documents.length) localStorage.removeItem(localKey(userId));
      else localStorage.setItem(localKey(userId), JSON.stringify(documents));
      return true;
    } catch (error) { this.logger?.error?.('writer.local.save.failed', error); return false; }
  }

  async persist(doc, user) {
    if (this.mode === 'cloud') {
      const payload = { user_id: user.id, title: doc.title, content: doc.content, folder: 'Основное', updated_at: new Date().toISOString() };
      const query = doc.id
        ? this.db.from('rim_writer_documents').update(payload).eq('id', doc.id).eq('user_id', user.id).select('id,title,content,folder,updated_at,created_at').single()
        : this.db.from('rim_writer_documents').insert(payload).select('id,title,content,folder,updated_at,created_at').single();
      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
    const now = new Date().toISOString();
    return { ...doc, id: doc.id || `local-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, created_at: doc.created_at || now, updated_at: now };
  }

  async save() {
    clearTimeout(this.timer); this.timer = null;
    const user = this.getUser();
    const editor = this.root?.querySelector('#rimWriterEditor');
    if (!user || !editor) return;
    const title = (this.root.querySelector('#rimWriterTitle')?.value || 'Без названия').trim().slice(0,160) || 'Без названия';
    const current = this.docs.find(item => String(item.id) === String(this.activeId));
    const draft = { ...(current || {}), id: this.activeId, title, content: sanitizeHtml(editor.innerHTML), user_id: user.id, updated_at: new Date().toISOString() };
    this.setStatus('Сохраняем…');
    this.saveChain = this.saveChain.catch(() => {}).then(async () => {
      try {
        // A second autosave may have been queued before the first insert returned
        // its server-generated ID. Resolve the ID when the queued operation runs,
        // otherwise rapid typing could create duplicate cloud documents.
        const effectiveDraft = { ...draft, id: this.activeId || draft.id };
        const saved = await this.persist(effectiveDraft, user);
        this.activeId = saved.id;
        const index = this.docs.findIndex(item => String(item.id) === String(saved.id));
        if (index >= 0) this.docs[index] = saved; else this.docs.unshift(saved);
        this.writeLocal(user.id);
        this.renderDocs();
        this.setStatus(this.mode === 'cloud' ? `Сохранено · ${new Date().toLocaleTimeString('ru-RU')}` : 'Сохранено на этом устройстве');
      } catch (error) {
        this.mode = 'local';
        const saved = { ...draft, id: draft.id || `local-${Date.now()}-${Math.random().toString(36).slice(2,8)}` };
        this.activeId = saved.id;
        const index = this.docs.findIndex(item => String(item.id) === String(saved.id));
        if (index >= 0) this.docs[index] = saved; else this.docs.unshift(saved);
        const ok = this.writeLocal(user.id);
        this.renderDocs();
        this.setStatus(ok ? 'Облако недоступно · сохранено локально' : 'Ошибка сохранения');
        this.logger?.error?.('writer.save.failed', error);
      }
    });
    await this.saveChain;
  }

  async select(id) {
    if (String(id) === String(this.activeId)) return;
    await this.save();
    this.activeId = id;
    this.loadActive();
    this.renderDocs();
    this.setStatus('Документ открыт');
  }

  async newDocument() {
    await this.save();
    this.activeId = null;
    this.root.querySelector('#rimWriterTitle').value = '';
    this.root.querySelector('#rimWriterEditor').innerHTML = '';
    this.updateCount();
    this.renderDocs();
    this.setStatus('Новый документ');
    this.root.querySelector('#rimWriterTitle').focus();
  }

  async back() {
    await this.save();
    this.root?.remove();
    this.root = null;
    if (typeof window.openFavorites === 'function') await window.openFavorites();
    else {
      document.getElementById('chatWindow')?.classList.remove('mobile-active');
      document.getElementById('sidebar')?.classList.remove('mobile-hidden');
    }
  }

  async closeForNavigation() {
    if (this.root?.isConnected) await this.save();
    this.root?.remove();
    this.root = null;
  }
}
