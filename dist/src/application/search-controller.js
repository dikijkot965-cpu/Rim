/**
 * Global RIM search: users, public channels, public groups.
 * Preserves existing CSS classes and page chrome entry points.
 */
export class SearchController {
  constructor({
    client,
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    openPage = null,
    logger = null
  } = {}) {
    this.client = client;
    this.document = documentRef;
    this.window = windowRef;
    this.openPage = openPage || ((title, html) => this.window?.fullPage?.(title, html));
    this.logger = logger;
    this.kind = 'all';
    this.timer = null;
    this.sequence = 0;
    this.disposed = false;
  }

  open() {
    if (this.disposed) return;
    this.kind = 'all';
    this.openPage(
      'Поиск в РИМе',
      `<input id="rimSearchInput" class="field" placeholder="Имя, @username, канал или сообщество">
       <div class="rim-search-tabs">
         <button type="button" class="action-btn active" data-rim-search-kind="all">Всё</button>
         <button type="button" class="action-btn" data-rim-search-kind="users">Люди</button>
         <button type="button" class="action-btn" data-rim-search-kind="channels">Каналы</button>
         <button type="button" class="action-btn" data-rim-search-kind="groups">Группы</button>
       </div>
       <div id="rimSearchResults"><div class="empty-state">Начните вводить запрос.</div></div>`
    );
    const input = this.document.getElementById('rimSearchInput');
    input?.addEventListener('input', () => this.schedule());
    this.document.querySelectorAll?.('[data-rim-search-kind]')?.forEach?.(button => {
      button.addEventListener('click', () => this.setKind(button.dataset.rimSearchKind, button));
    });
  }

  setKind(kind, button = null) {
    this.kind = kind || 'all';
    this.window.__rimSearchKind = this.kind;
    this.document.querySelectorAll?.('.rim-search-tabs button')?.forEach?.(node => {
      node.classList.toggle('active', node === button || node.dataset?.rimSearchKind === this.kind);
    });
    this.schedule(0);
  }

  schedule(delay = 350) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.run(); }, delay);
  }

  async run() {
    if (this.disposed) return;
    const sequence = ++this.sequence;
    const out = this.document.getElementById('rimSearchResults');
    if (!out) return;
    const q = String(this.document.getElementById('rimSearchInput')?.value || '')
      .trim()
      .replace(/^@/, '');
    if (q.length < 2) {
      out.innerHTML = '<div class="empty-state">Введите не менее двух символов.</div>';
      return;
    }
    out.innerHTML = '<div class="notice">Поиск...</div>';
    try {
      const parts = [];
      if (this.kind === 'all' || this.kind === 'users') {
        parts.push(this.#searchUsers(q));
      } else {
        parts.push(Promise.resolve(''));
      }
      if (this.kind === 'all' || this.kind === 'channels') {
        parts.push(this.#searchChannels(q));
      } else {
        parts.push(Promise.resolve(''));
      }
      if (this.kind === 'all' || this.kind === 'groups') {
        parts.push(this.#searchGroups(q));
      } else {
        parts.push(Promise.resolve(''));
      }
      const chunks = await Promise.all(parts);
      if (sequence !== this.sequence) return;
      const html = chunks.join('');
      out.innerHTML = html || '<div class="empty-state">Ничего не найдено.</div>';
    } catch (error) {
      if (sequence !== this.sequence) return;
      this.logger?.warn?.('search.failed', { message: error?.message });
      out.innerHTML = `<div class="notice">Поиск недоступен: ${escapeHtml(error?.message || error)}</div>`;
    }
  }

  async #searchUsers(q) {
    const { data, error } = await this.client
      .from('profiles')
      .select('id,username,display_name,avatar_path,avatar_url')
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .limit(15);
    if (error) throw error;
    const rows = [];
    for (const profile of data || []) {
      let url = profile.avatar_url || '';
      if (profile.avatar_path) {
        try {
          const { data: signed } = await this.client.storage.from('avatars').createSignedUrl(profile.avatar_path, 3600);
          url = signed?.signedUrl || url;
        } catch { /* ignore */ }
      }
      const username = escapeHtml(profile.username || '');
      rows.push(`<div class="rim-search-result" data-rim-search-user="${username}">
        ${avatarMarkup(url, profile.display_name || profile.username)}
        <div><b>${escapeHtml(profile.display_name || profile.username)}</b>
        <div class="feature-small">@${username}</div></div></div>`);
    }
    const html = rows.join('');
    queueMicrotask(() => {
      this.document.querySelectorAll?.('[data-rim-search-user]')?.forEach?.(node => {
        node.addEventListener('click', () => {
          this.window?.closePage?.();
          this.window?.findUserByName?.(node.getAttribute('data-rim-search-user'));
        });
      });
    });
    return html;
  }

  async #searchChannels(q) {
    const { data, error } = await this.client
      .from('channels')
      .select('id,title,username,description,avatar_path')
      .or(`title.ilike.%${q}%,username.ilike.%${q}%`)
      .eq('is_public', true)
      .limit(15);
    if (error) throw error;
    return (data || []).map(channel => {
      const id = escapeHtml(channel.id);
      return `<div class="rim-search-result" data-rim-search-channel="${id}">
        ${avatarMarkup('', channel.title)}
        <div><b>${escapeHtml(channel.title)}</b>
        <div class="feature-small">${channel.username ? '@' + escapeHtml(channel.username) : 'Канал'} · ${escapeHtml(channel.description || '')}</div></div></div>`;
    }).join('') + this.#bindChannelClicks();
  }

  #bindChannelClicks() {
    queueMicrotask(() => {
      this.document.querySelectorAll?.('[data-rim-search-channel]')?.forEach?.(node => {
        if (node.dataset.bound) return;
        node.dataset.bound = '1';
        node.addEventListener('click', () => {
          this.window?.closePage?.();
          this.window?.openChannel?.(node.getAttribute('data-rim-search-channel'));
        });
      });
    });
    return '';
  }

  async #searchGroups(q) {
    const { data: groups, error } = await this.client
      .from('conversations')
      .select('id,title,username,avatar_path')
      .eq('type', 'group')
      .eq('is_public', true)
      .or(`title.ilike.%${q}%,username.ilike.%${q}%`)
      .limit(15);
    if (error) throw error;
    return (groups || []).map(group => {
      const id = escapeHtml(group.id);
      const letter = escapeHtml(String(group.title || 'Г').slice(0, 1));
      return `<div class="rim-search-result">
        <div class="avatar">${letter}</div>
        <div class="grow"><b>${escapeHtml(group.title || 'Группа')}</b>
        <div class="feature-small">${group.username ? '@' + escapeHtml(group.username) : 'Публичная группа'}</div></div>
        <button type="button" class="action-btn" data-rim-join-group="${id}">Вступить</button></div>`;
    }).join('') + this.#bindGroupJoins();
  }

  #bindGroupJoins() {
    queueMicrotask(() => {
      this.document.querySelectorAll?.('[data-rim-join-group]')?.forEach?.(node => {
        if (node.dataset.bound) return;
        node.dataset.bound = '1';
        node.addEventListener('click', event => {
          event.preventDefault();
          this.window?.rimJoinPublicGroup?.(node.getAttribute('data-rim-join-group'));
        });
      });
    });
    return '';
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.sequence += 1;
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

function avatarMarkup(url, title) {
  if (url) {
    return `<div class="avatar"><img src="${escapeHtml(url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit"></div>`;
  }
  const letter = escapeHtml(String(title || '?').trim().slice(0, 1).toUpperCase() || '?');
  return `<div class="avatar">${letter}</div>`;
}
