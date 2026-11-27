import { escapeHtml, escapeAttr } from '../core/html.js';
/**
 * Secondary navigation: More / Tools as sidebar sections (same shell as Chats/Channels).
 */
export class NavigationPagesController {
  constructor({
    openPage = null,
    setNavActive = null,
    windowRef = globalThis.window,
    documentRef = globalThis.document
  } = {}) {
    this.window = windowRef;
    this.document = documentRef || windowRef?.document || globalThis.document;
    this.openPage = openPage;
    this.setNavActive = setNavActive || ((id) => this.window?.setNavActive?.(id));
  }

  #ensureSection(id, title) {
    const doc = this.document;
    if (!doc?.getElementById) return null;
    let section = doc.getElementById(id);
    if (section) return section;
    const sidebar = doc.getElementById('sidebar') || doc.querySelector?.('.sidebar');
    if (!sidebar) return null;
    section = doc.createElement('div');
    section.id = id;
    section.className = 'page-content hidden';
    section.innerHTML = `<div class="rim-section-head"><h2 class="rim-section-title">${escapeHtml(title)}</h2></div><div class="rim-section-body"></div>`;
    sidebar.appendChild(section);
    return section;
  }

  #showOnly(sectionId) {
    const doc = this.document;
    if (!doc || typeof doc.getElementById !== 'function') return;
    ['chatsSection', 'feedSection', 'channelsSection', 'musicSection', 'moreSection', 'toolsSection'].forEach(id => {
      const el = doc.getElementById(id);
      if (!el) return;
      const on = id === sectionId;
      el.classList.toggle('hidden', !on);
      if (id === 'chatsSection') {
        el.style.display = on ? 'flex' : 'none';
      } else if (id === 'moreSection' || id === 'toolsSection') {
        el.style.display = on ? 'flex' : 'none';
      } else {
        el.style.display = on ? '' : 'none';
      }
    });
    // Close open chat overlay when switching primary sections
    try {
      doc.getElementById('chatWindow')?.classList.remove('open', 'mobile-active');
      doc.getElementById('app')?.classList.remove('rim-chat-focus');
    } catch { /* ignore */ }
  }

  #gridHtml(items) {
    return `<div class="rim-page-grid">${items.map(it =>
      `<button class="rim-page-tile" type="button" data-rim-nav="${escapeAttr(it.action)}"><b>${escapeHtml(it.title)}</b><small>${escapeHtml(it.sub)}</small></button>`
    ).join('')}</div>`;
  }

  #paintGrid(container, items) {
    if (!container) return;
    container.innerHTML = `<div class="rim-page-grid">${items.map(it =>
      `<button class="rim-page-tile" type="button" data-rim-nav="${escapeAttr(it.action)}"><b>${escapeHtml(it.title)}</b><small>${escapeHtml(it.sub)}</small></button>`
    ).join('')}</div>`;
    container.querySelectorAll('[data-rim-nav]').forEach(node => {
      node.addEventListener('click', () => {
        const action = node.getAttribute('data-rim-nav');
        const fn = this.window?.[action];
        if (typeof fn === 'function') {
          try { fn.call(this.window); } catch (e) { console.warn('[RIM nav]', action, e); }
        } else {
          console.warn('[RIM nav] missing', action);
        }
      });
    });
  }

  openMore() {
    this.setNavActive?.('more');
    try {
      const doc = this.document;
      ['tabChats','tabChannels','tabMusic','tabToolsFull'].forEach(id => doc?.getElementById?.(id)?.classList.remove('selected'));
      doc?.getElementById?.('tabMoreFull')?.classList.add('selected');
    } catch {}
    const section = this.#ensureSection('moreSection', 'Ещё');
    this.#showOnly('moreSection');
    if (!section) {
      // Fallback when DOM shell is not available (unit tests / early boot)
      const html = this.#gridHtml([
        { action: 'rimOpenZladenChat', title: '✦ Злыдя', sub: 'Личный чат с @Zladen_bot' },
        { action: 'rimOpenZladenGroupPicker', title: '♧ Добавить Злыдю в группу', sub: 'Подключить помощника к групповой беседе' },
        { action: 'openProfile', title: '👤 Профиль', sub: 'Личные данные и аватар' },
        { action: 'openSettings', title: '⚙ Настройки', sub: 'Язык, тема и приватность' },
        { action: 'openImperialCabinet', title: '⚜ Имперский кабинет', sub: 'Уведомления и служебные разделы' },
        { action: 'rimCalls', title: '☎ Звонки', sub: 'Голосовые и видеозвонки' },
        { action: 'rimSearch', title: '⌕ Поиск', sub: 'Пользователи, каналы и сообщества' },
        { action: 'rimAdmin', title: '⚜ Императорская панель', sub: 'Реклама и статистика' }
      ]);
      this.openPage?.('Ещё', html);
      return;
    }
    const body = section.querySelector('.rim-section-body') || section;
    this.#paintGrid(body, [
      { action: 'rimOpenZladenChat', title: '✦ Злыдя', sub: 'Личный чат с @Zladen_bot' },
      { action: 'rimOpenZladenGroupPicker', title: '♧ Добавить Злыдю в группу', sub: 'Подключить помощника к групповой беседе' },
      { action: 'openProfile', title: '👤 Профиль', sub: 'Личные данные и аватар' },
      { action: 'openSettings', title: '⚙ Настройки', sub: 'Язык, тема и приватность' },
      { action: 'openImperialCabinet', title: '⚜ Имперский кабинет', sub: 'Уведомления и служебные разделы' },
      { action: 'rimCalls', title: '☎ Звонки', sub: 'Голосовые и видеозвонки' },
      { action: 'rimSearch', title: '⌕ Поиск', sub: 'Пользователи, каналы и сообщества' },
      { action: 'rimAdmin', title: '⚜ Императорская панель', sub: 'Реклама и статистика' }
    ]);
  }

  openTools() {
    this.setNavActive?.('tools');
    try {
      const doc = this.document;
      ['tabChats','tabChannels','tabMusic','tabMoreFull'].forEach(id => doc?.getElementById?.(id)?.classList.remove('selected'));
      doc?.getElementById?.('tabToolsFull')?.classList.add('selected');
    } catch {}
    const section = this.#ensureSection('toolsSection', 'Инструменты');
    this.#showOnly('toolsSection');
    const items = [
      { action: 'newDirectChat', title: '✉ Новый чат', sub: 'Найти пользователя' },
      { action: 'newGroupChat', title: '👥 Создать группу', sub: 'Новая групповая беседа' },
      { action: 'createChannel', title: '▤ Создать канал', sub: 'Публичный или закрытый канал' },
      { action: 'rimSearch', title: '⌕ Поиск', sub: 'Поиск по всему РИМу' },
      { action: 'openPinnedMessages', title: '📌 Закреплённое', sub: 'Сохранённые сообщения текущего чата' },
      { action: 'openNotificationSettings', title: '🔔 Уведомления', sub: 'Настройка оповещений' },
      { action: 'rimOpenBots', title: '⌘ Боты и Царь-бот', sub: 'Создание, настройка и код ботов' }
    ];
    if (this.window?.isImperator?.() === true) items.push({ action: 'rimOpenZladenSettings', title: '⚙ Настроить Злыдю', sub: 'Имя, аватар и ссылка системного помощника' });
    if (!section) {
      this.openPage?.('Инструменты', this.#gridHtml(items));
      return;
    }
    const body = section.querySelector('.rim-section-body') || section;
    this.#paintGrid(body, items);
  }
}
