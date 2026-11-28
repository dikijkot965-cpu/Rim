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
    getUser = () => null,
    logger = null
  } = {}) {
    this.client = client;
    this.document = documentRef;
    this.window = windowRef;
    this.openPage = openPage || ((title, html) => this.window?.fullPage?.(title, html));
    this.getUser = getUser;
    this.logger = logger;
    this.kind = 'all';
    this.timer = null;
    this.sequence = 0;
    this.disposed = false;
    this.boundResultsRoot = null;
    this.resultsClickHandler = event => this.#onResultsClick(event);
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
         <button type="button" class="action-btn" data-rim-search-kind="messages">Сообщения</button>
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
    this.#bindResultsRoot(out);
    const q = String(this.document.getElementById('rimSearchInput')?.value || '')
      .trim()
      .replace(/^@/, '')
      .replace(/[\\%,._()]/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 64);
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
      if (this.kind === 'all' || this.kind === 'messages') {
        parts.push(this.#searchMessages(q));
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
      this.#bindMessageResults();
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
    return rows.join('');
  }

  async #searchMessages(q) {
    const user = this.getUser?.();
    if (!user?.id) return '';
    const memberships = await this.client.from('conversation_members').select('conversation_id').eq('user_id', user.id).limit(500);
    if (memberships.error) throw memberships.error;
    const ids = [...new Set((memberships.data || []).map(row => String(row.conversation_id)).filter(Boolean))].slice(0, 200);
    if (!ids.length) return '';
    const scopes = await this.client.from('conversations').select('id,type,title,e2e_mode,is_secret').in('id', ids);
    if (scopes.error) throw scopes.error;
    const allowed = (scopes.data || []).filter(row => row.e2e_mode === 'off' && row.is_secret !== true && ['direct','group'].includes(row.type));
    if (!allowed.length) return '';
    const allowedIds = allowed.map(row => String(row.id));
    const result = await this.client.from('chat_messages').select('id,conversation_id,body,created_at').in('conversation_id', allowedIds).ilike('body', '%' + q + '%').order('created_at', { ascending: false }).limit(25);
    if (result.error) throw result.error;
    const titles = new Map(allowed.map(row => [String(row.id), row.title || (row.type === 'direct' ? 'Личный чат' : 'Группа')]));
    return (result.data || []).map(row => '<button type="button" class="rim-search-result" data-rim-search-conversation="' + escapeHtml(row.conversation_id) + '"><b>' + escapeHtml(titles.get(String(row.conversation_id)) || 'Переписка') + '</b><span class="feature-small">' + escapeHtml(String(row.body || 'Вложение').slice(0, 180)) + '</span></button>').join('');
  }

  async #searchChannels(q) {
    const { data, error } = await this.client
      .from('channels')
      .select('id,title,username,description,avatar_path')
      .or(`title.ilike.%${q}%,username.ilike.%${q}%`)
      .limit(15);
    if (error) throw error;
    return (data || []).map(channel => {
      const id = escapeHtml(channel.id);
      return `<div class="rim-search-result" data-rim-search-channel="${id}">
        ${avatarMarkup('', channel.title)}
        <div><b>${escapeHtml(channel.title)}</b>
        <div class="feature-small">${channel.username ? '@' + escapeHtml(channel.username) : 'Канал'} · ${escapeHtml(channel.description || '')}</div></div></div>`;
    }).join('');
  }


  async #searchGroups(q) {
    const { data: groups, error } = await this.client
      .from('conversations')
      .select('id,title,avatar_path,is_private,e2e_mode')
      .eq('type', 'group')
      .eq('is_private', false)
      .ilike('title', '%' + q + '%')
      .limit(15);
    if (error) throw error;
    return (groups || []).map(group => {
      const id = escapeHtml(group.id);
      const letter = escapeHtml(String(group.title || 'Г').slice(0, 1));
      return `<div class="rim-search-result" data-rim-join-group="${id}" role="button" tabindex="0">
        <div class="avatar">${letter}</div>
        <div class="grow"><b>${escapeHtml(group.title || 'Группа')}</b>
        <div class="feature-small">Открытая группа · нажмите, чтобы вступить и открыть</div></div>
        <span class="action-btn" aria-hidden="true">Открыть</span></div>`;
    }).join('');
  }


  #bindResultsRoot(root) {
    if (this.boundResultsRoot === root) return;
    this.boundResultsRoot?.removeEventListener?.('click', this.resultsClickHandler);
    this.boundResultsRoot = root;
    root.addEventListener?.('click', this.resultsClickHandler);
  }

  #onResultsClick(event) {
    const origin = event.target;
    const user = origin?.closest?.('[data-rim-search-user]');
    const channel = origin?.closest?.('[data-rim-search-channel]');
    const conversation = origin?.closest?.('[data-rim-search-conversation]');
    const group = origin?.closest?.('[data-rim-join-group]');
    const item = user || channel || conversation || group;
    if (!item || !this.boundResultsRoot?.contains?.(item)) return;
    event.preventDefault?.();
    if (user) {
      const username = user.getAttribute('data-rim-search-user');
      if (!username) return;
      this.window?.closePage?.();
      void this.window?.findUserByName?.(username);
    } else if (channel) {
      const id = channel.getAttribute('data-rim-search-channel');
      if (!id) return;
      this.window?.closePage?.();
      void this.window?.openChannel?.(id);
    } else if (conversation) {
      const id = conversation.getAttribute('data-rim-search-conversation');
      if (!id) return;
      this.window?.closePage?.();
      void this.window?.openConversation?.(id);
    } else if (group) {
      const id = group.getAttribute('data-rim-join-group');
      if (!id) return;
      void this.window?.rimJoinPublicGroup?.(id);
    }
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.boundResultsRoot?.removeEventListener?.('click', this.resultsClickHandler);
    this.boundResultsRoot = null;
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
