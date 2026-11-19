/**
 * Post-render message decorations that used to be stacked as successive
 * window.renderMessages wrappers in legacy modules 06 / 18 / 24.
 * Keeps existing CSS classes and action entrypoints.
 */
export class MessageDecorationsController {
  constructor({
    client,
    getUser,
    getMessages,
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    logger = null
  } = {}) {
    this.client = client;
    this.getUser = getUser;
    this.getMessages = getMessages;
    this.document = documentRef;
    this.window = windowRef;
    this.logger = logger;
    this.sequence = 0;
    this.disposed = false;
  }

  invalidate() {
    this.sequence += 1;
  }

  async decorate(root = null) {
    if (this.disposed) return;
    const sequence = ++this.sequence;
    const box = root || this.document?.getElementById?.('messages');
    if (!box) return;

    this.#decorateAdvancedActions(box);
    this.#decorateForwardLabels(box);
    await this.#decorateAttachments(box, sequence);
  }

  #decorateAdvancedActions(box) {
    const nodes = box.querySelectorAll?.('.message[data-id]') || [];
    for (const el of nodes) {
      const actions = el.querySelector('.message-actions');
      if (!actions) continue;
      const id = el.dataset.id;

      if (!actions.querySelector('[data-pin-action]')) {
        const pin = this.document.createElement('button');
        pin.type = 'button';
        pin.textContent = '📌';
        pin.title = 'Сохранить в закреплённом';
        pin.dataset.pinAction = '1';
        pin.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          this.window?.pinMessage?.(id);
        });
        actions.append(pin);
      }

      if (!el.classList?.contains?.('mine') && !actions.querySelector('[data-rim-report]')) {
        const report = this.document.createElement('button');
        report.type = 'button';
        report.textContent = '⚑';
        report.title = 'Пожаловаться';
        report.dataset.rimReport = '1';
        report.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          const rows = this.getMessages?.() || [];
          const message = rows.find(row => String(row.id) === String(id));
          const username = message?.sender_username || '';
          if (typeof this.window?.openReportForm === 'function') {
            this.window.openReportForm({ username });
          }
        });
        actions.append(report);
      }

      if (!actions.querySelector('[data-rim-advanced]')) {
        const button = this.document.createElement('button');
        button.type = 'button';
        button.dataset.rimAdvanced = '1';
        button.title = 'Дополнительные действия';
        button.textContent = '⋯';
        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          this.window?.rimOpenMessageActions?.(id);
        });
        actions.append(button);
      }
    }
  }

  #decorateForwardLabels(box) {
    const rows = this.getMessages?.() || [];
    for (const message of rows) {
      if (!message?.forwarded_from_message_id) continue;
      const el = box.querySelector?.(`.message[data-id="${cssEscape(message.id)}"]`);
      if (!el) continue;
      let label = el.querySelector('.rim-forward-source');
      if (message.forwarded_hide_sender) {
        if (!label) {
          label = this.document.createElement('div');
          label.className = 'rim-forward-source';
          el.insertBefore(label, el.firstChild);
        }
        label.textContent = 'Пересланное сообщение';
      }
    }
  }

  async #decorateAttachments(box, sequence) {
    const user = this.getUser?.();
    const rows = (this.getMessages?.() || []).filter(message => message?.attachment_path);
    if (!rows.length || !this.client?.storage) return;

    for (const message of rows) {
      if (sequence !== this.sequence) return;
      const el = box.querySelector?.(`.message[data-id="${cssEscape(message.id)}"]`);
      if (!el || el.querySelector('.rim-file-chip')) continue;

      try {
        const { data, error } = await this.client.storage.from('chat-files').createSignedUrl(message.attachment_path, 3600);
        if (sequence !== this.sequence) return;
        if (error || !data?.signedUrl) continue;

        const chip = this.document.createElement('div');
        chip.className = 'rim-file-chip';
        const url = data.signedUrl;
        if (message.attachment_kind === 'video') {
          chip.innerHTML = `<video class="rim-chat-media" controls preload="metadata" src="${escapeAttr(url)}"></video>`;
        } else if (message.attachment_kind === 'audio') {
          chip.innerHTML = `<audio controls preload="none" src="${escapeAttr(url)}"></audio>`;
        } else {
          const name = escapeHtml(message.attachment_name || 'Открыть файл');
          chip.innerHTML = `<a href="${escapeAttr(url)}" target="_blank" rel="noopener">📎 ${name}</a>`;
        }
        const meta = el.querySelector('.message-meta');
        if (meta) el.insertBefore(chip, meta);
        else el.append(chip);
      } catch (error) {
        this.logger?.warn?.('messages.decoration.attachment.failed', { message: error?.message, id: message.id });
      }
    }
  }

  dispose() {
    this.disposed = true;
    this.invalidate();
  }
}

function cssEscape(value) {
  const text = String(value ?? '');
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(text);
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeAttr(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
