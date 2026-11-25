/**
 * Base message list HTML renderer.
 * Preserves existing message CSS classes and action entry points while moving
 * markup construction out of the legacy renderMessages chain.
 */
import { escapeHtml } from '../core/html.js';
import { resolveDeliveryStatus, shouldShowDeliveryTicks } from '../domain/delivery.js';

function withTimeout(promise, timeoutMs, message) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); })
  ]).finally(() => clearTimeout(timer));
}

function formatTime(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('ru-RU', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return '';
  }
}

export function renderMentionsHtml(text) {
  const safe = escapeHtml(text);
  return safe.replace(/@([a-zA-Z0-9_]+)/g, (_match, username) => (
    `<span class="rim-mention" data-rim-msg-action="find-user" data-username="${escapeHtml(username)}" style="color:var(--gold);font-weight:700;cursor:pointer">@${escapeHtml(username)}</span>`
  ));
}

export function buildMessageArticleHtml(message, {
  currentUserId,
  profiles = {},
  messages = [],
  imageUrls = {},
  peerReadAt = null,
  receiptsEnabled = true
} = {}) {
  const mine = message._rimOutboxPending || String(message.sender_id) === String(currentUserId);
  const profile = profiles[message.sender_id] || profiles[String(message.sender_id)] || {};
  const author = escapeHtml(profile.display_name || profile.username || 'Пользователь');
  const reply = messages.find(row => String(row.id) === String(message.reply_to_message_id));
  const body = renderMentionsHtml(message.body || '');
  const id = escapeHtml(message.id);
  const image = imageUrls[message.id] || imageUrls[String(message.id)];

  return `<article class="message ${mine ? 'mine' : ''}" data-id="${id}" data-rim-msg="1"${message._rimLocalOnly ? ' data-rim-local-only="true" data-rim-e2e="true"' : ''}>
    ${!mine ? `<div class="message-author">${author}</div>` : ''}
    ${reply ? `<div class="reply-preview">Ответ на: ${escapeHtml(reply.body || 'Вложение')}</div>` : ''}
    <div class="message-body">${body}</div>
    ${image ? `<img class="message-image" src="${escapeHtml(image)}" loading="lazy">` : (message.image_path ? `<span class="rim-message-media-pending" data-rim-image-slot="${id}">Изображение загружается…</span>` : '')}
    ${message.sticker_id ? `<div class="message-sticker">${escapeHtml(message.sticker_id)}</div>` : ''}
    <div class="message-meta">
      ${message.edited_at ? 'изм. · ' : ''}${escapeHtml(formatTime(message.created_at || message.clientCreatedAt))}
      ${(() => {
        if (message._rimLocalOnly || !shouldShowDeliveryTicks(message, currentUserId)) return '';
        const d = resolveDeliveryStatus(message, { peerReadAt, receiptsEnabled });
        return ` <span class="rim-send-check" data-rim-delivery="${escapeHtml(d.status)}" title="${escapeHtml(d.label)}" aria-label="${escapeHtml(d.label)}">${d.ticks}</span>`;
      })()}
    </div>
  </article>`;
}

export class MessageListRenderer {
  constructor({
    client,
    getUser,
    getMessages,
    getActiveConversation = () => null,
    getOutboxMessages = null,
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    logger = null
  } = {}) {
    this.client = client;
    this.getUser = getUser;
    this.getMessages = getMessages;
    this.getActiveConversation = getActiveConversation;
    this.getOutboxMessages = getOutboxMessages;
    this.peerReadAt = null;
    this.receiptsEnabled = true;
    this.document = documentRef;
    this.window = windowRef;
    this.logger = logger;
    this.renderSequence = 0;
    this.disposed = false;
    this.boundRoot = null;
    this.clickHandler = this.#onClick.bind(this);
  }

  #onClick(event) {
    const actionEl = event.target?.closest?.('[data-rim-msg-action]');
    if (actionEl && this.boundRoot?.contains?.(actionEl)) {
      const action = actionEl.dataset.rimMsgAction;
      const messageId = actionEl.dataset.messageId;
      this.#runAction(action, messageId, actionEl.dataset.emoji);
      return;
    }
    const msg = event.target?.closest?.('.message[data-id]');
    if (!msg || !this.boundRoot?.contains?.(msg)) return;
    // Decrypted E2E rows are device-local and have no server message ID.
    // Do not expose legacy edit/delete/react/forward actions for them.
    if (msg.dataset.rimLocalOnly === 'true') return;
    if (event.target?.closest?.('a,button,input,textarea,img')) return;
    this.#openMessageSheet(msg.dataset.id, msg);
  }

  #runAction(action, messageId, emoji) {
    switch (action) {
      case 'reply': this.window?.setReply?.(messageId); break;
      case 'edit': this.window?.editMessage?.(messageId); break;
      case 'delete': this.window?.deleteMessage?.(messageId); break;
      case 'react': this.window?.reactToMessage?.(messageId, emoji || '👍'); break;
      case 'copy': this.window?.rimCopyMessage?.(messageId); break;
      case 'forward': this.window?.rimForwardChoose?.(messageId); break;
      case 'more': this.window?.rimOpenMessageActions?.(messageId); break;
      case 'favorite': this.window?.rimSaveMessageToFavorites?.(messageId); break;
      case 'pin': this.window?.pinMessage?.(messageId); break;
      case 'report': this.window?.openReportForm?.({ messageId, conversationId: this.getActiveConversation?.()?.id }); break;
      default: break;
    }
    this.#closeSheet();
  }

  #closeSheet() {
    this.window?.document?.getElementById?.('rimMsgSheet')?.remove();
  }

  #openMessageSheet(messageId, anchor) {
    this.#closeSheet();
    const doc = this.document;
    const mine = anchor?.classList?.contains?.('mine');
    const sheet = doc.createElement('div');
    sheet.id = 'rimMsgSheet';
    sheet.className = 'rim-msg-sheet';
    sheet.innerHTML = `
      <div class="rim-msg-sheet-backdrop" data-rim-sheet-close="1"></div>
      <div class="rim-msg-sheet-panel">
        <div class="rim-msg-react-bar">
          ${['👍','❤️','😂','🔥','👏','🎉','😮','😢'].map(e =>
            `<button type="button" class="rim-msg-react" data-rim-msg-action="react" data-message-id="${messageId}" data-emoji="${e}">${e}</button>`
          ).join('')}
        </div>
        <button type="button" class="rim-msg-sheet-item" data-rim-msg-action="reply" data-message-id="${messageId}">↩ Ответить</button>
        <button type="button" class="rim-msg-sheet-item" data-rim-msg-action="copy" data-message-id="${messageId}">⧉ Копировать</button>
        <button type="button" class="rim-msg-sheet-item" data-rim-msg-action="forward" data-message-id="${messageId}">→ Переслать</button>
        <button type="button" class="rim-msg-sheet-item" data-rim-msg-action="favorite" data-message-id="${messageId}">☆ В Избранное</button>
        <button type="button" class="rim-msg-sheet-item" data-rim-msg-action="pin" data-message-id="${messageId}">⌖ Закрепить</button>
        ${!mine && this.getActiveConversation?.()?.type === 'group' ? `<button type="button" class="rim-msg-sheet-item" data-rim-msg-action="report" data-message-id="${messageId}">⚑ Пожаловаться</button>` : ''}
        ${mine ? `<button type="button" class="rim-msg-sheet-item" data-rim-msg-action="edit" data-message-id="${messageId}">✎ Изменить</button>
        <button type="button" class="rim-msg-sheet-item danger" data-rim-msg-action="delete" data-message-id="${messageId}">🗑 Удалить</button>` : ''}
        <button type="button" class="rim-msg-sheet-item" data-rim-sheet-close="1">Закрыть</button>
      </div>`;
    doc.body.appendChild(sheet);
    const panel = sheet.querySelector?.('.rim-msg-sheet-panel');
    const rect = anchor?.getBoundingClientRect?.();
    const viewportWidth = Number(this.window?.innerWidth || doc.documentElement?.clientWidth || 360);
    const viewportHeight = Number(this.window?.innerHeight || doc.documentElement?.clientHeight || 640);
    if (panel && rect) {
      const width = Math.min(340, Math.max(260, viewportWidth - 24));
      const left = Math.max(12, Math.min(rect.left, viewportWidth - width - 12));
      panel.style.width = width + 'px'; panel.style.left = left + 'px'; panel.style.right = 'auto'; panel.style.bottom = 'auto';
      panel.style.top = Math.max(12, rect.bottom + 8) + 'px';
      const panelHeight = panel.getBoundingClientRect?.().height || 360;
      if (rect.bottom + panelHeight + 20 > viewportHeight) { panel.style.top = 'auto'; panel.style.bottom = Math.max(12, viewportHeight - rect.top + 8) + 'px'; }
    }
    sheet.addEventListener('click', (event) => {
      if (event.target?.closest?.('[data-rim-sheet-close]')) {
        this.#closeSheet();
        return;
      }
      const actionEl = event.target?.closest?.('[data-rim-msg-action]');
      if (!actionEl) return;
      this.#runAction(actionEl.dataset.rimMsgAction, actionEl.dataset.messageId, actionEl.dataset.emoji);
    });
  }

  #bindRoot(root) {
    if (this.boundRoot === root) return;
    this.boundRoot?.removeEventListener?.('click', this.clickHandler);
    this.boundRoot = root;
    this.boundRoot?.addEventListener?.('click', this.clickHandler);
  }

  async #loadProfiles(ids) {
    const unique = [...new Set((ids || []).filter(Boolean).map(String))];
    if (!unique.length) return {};
    const { data, error } = await this.client
      .from('profiles')
      .select('id,username,display_name,avatar_url,name_color')
      .in('id', unique);
    if (error) throw error;
    const result = {};
    for (const profile of data || []) result[profile.id] = profile;
    return result;
  }

  async #loadImageUrls(messages) {
    const withImages = (messages || []).filter(message => message?.image_path);
    if (!withImages.length || !this.client?.storage) return {};
    const entries = await Promise.all(withImages.map(async message => {
      try {
        const { data, error } = await this.client.storage.from('chat-files').createSignedUrl(message.image_path, 1800);
        if (error || !data?.signedUrl) return null;
        return [String(message.id), data.signedUrl];
      } catch {
        return null;
      }
    }));
    const urls = {};
    for (const entry of entries) if (entry) urls[entry[0]] = entry[1];
    return urls;
  }

  setDeliveryContext({ peerReadAt = null, receiptsEnabled = true } = {}) {
    this.peerReadAt = peerReadAt;
    this.receiptsEnabled = receiptsEnabled !== false;
  }

  async render() {
    if (this.disposed) return;
    const sequence = ++this.renderSequence;
    const box = this.document?.getElementById?.('messages');
    if (!box) return;

    this.#bindRoot(box);
    const user = this.getUser?.();
    const serverMessages = this.getMessages?.() || [];
    const pending = typeof this.getOutboxMessages === 'function' ? (this.getOutboxMessages() || []) : [];
    const messages = [...serverMessages, ...pending];
    const nearBottom = (box.scrollHeight - box.scrollTop - box.clientHeight) < 100;

    if (!messages.length) {
      box.innerHTML = '<div class="empty-state">Здесь пока нет сообщений.<br>Начни разговор.</div>';
      return;
    }

    // Paint the text timeline first. Media signing must never hold the entire
    // conversation hostage on slow/blocked Storage networks (common on mobile).
    let profiles = {};
    try {
      profiles = await withTimeout(this.#loadProfiles(messages.map(message => message.sender_id)), 4500, 'profiles_timeout');
    } catch (error) {
      this.logger?.warn?.('messages.profiles.degraded', { message: error?.message || String(error) });
    }
    if (sequence !== this.renderSequence) return;

    box.innerHTML = messages.map(message => buildMessageArticleHtml(message, {
      currentUserId: user?.id, profiles: profiles || {}, messages, imageUrls: {},
      peerReadAt: this.peerReadAt ?? null, receiptsEnabled: this.receiptsEnabled !== false
    })).join('');

    for (const message of messages) {
      const color = profiles?.[message.sender_id]?.name_color || profiles?.[String(message.sender_id)]?.name_color;
      if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) continue;
      const author = box.querySelector(`.message[data-id="${cssEscape(message.id)}"] .message-author`);
      if (author) author.style.color = color;
    }
    if (nearBottom) box.scrollTop = box.scrollHeight;

    // Hydrate attachments asynchronously and with bounded concurrency/timeouts.
    // A failed media URL leaves the text and the rest of the chat usable.
    const imageMessages = messages.filter(message => message?.image_path);
    if (imageMessages.length) void this.#hydrateImages(imageMessages, sequence, box);
  }

  async #hydrateImages(messages, sequence, box) {
    let cursor = 0;
    const worker = async () => {
      while (cursor < messages.length) {
        const message = messages[cursor++];
        if (sequence !== this.renderSequence || this.disposed) return;
        const slot = box.querySelector(`[data-rim-image-slot="${cssEscape(message.id)}"]`);
        if (!slot) continue;
        try {
          const request = this.client.storage.from('chat-files').createSignedUrl(message.image_path, 1800);
          const result = await withTimeout(request, 5000, 'media_url_timeout');
          if (sequence !== this.renderSequence || this.disposed || !slot.isConnected) return;
          if (result?.error || !result?.data?.signedUrl) { slot.textContent = 'Вложение временно недоступно'; continue; }
          const image = this.document.createElement('img');
          image.className = 'message-image'; image.loading = 'lazy'; image.alt = 'Изображение';
          image.src = result.data.signedUrl; slot.replaceWith(image);
        } catch (error) {
          if (sequence !== this.renderSequence || this.disposed) return;
          if (slot.isConnected) slot.textContent = 'Не удалось загрузить изображение';
          this.logger?.warn?.('messages.media.hydration.failed', { messageId: message.id, message: error?.message || String(error) });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, messages.length) }, () => worker()));
  }

  dispose() {
    this.disposed = true;
    this.renderSequence += 1;
    this.boundRoot?.removeEventListener?.('click', this.clickHandler);
    this.boundRoot = null;
  }
}

function cssEscape(value) {
  const text = String(value ?? '');
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(text);
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
