/**
 * Owns chat window shell chrome after a conversation is selected:
 * mobile layout classes, provisional header text, group settings button,
 * pinned-messages shortcut, optional group avatar image.
 * Does not own message loading or peer profile resolution.
 */
export class ConversationShellController {
  constructor({
    client,
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    logger = null
  } = {}) {
    this.client = client;
    this.document = documentRef;
    this.window = windowRef;
    this.logger = logger;
    this.avatarSequence = 0;
    this.disposed = false;
  }

  getEl(id) {
    return this.document?.getElementById?.(id) || null;
  }

  paintProvisionalHeader(conversation) {
    if (this.disposed || !conversation) return;
    const title = this.getEl('chatHeadName');
    const status = this.getEl('chatHeadStatus');
    const avatar = this.getEl('chatHeadAvatar');
    const isGroup = conversation.type === 'group';

    if (title) {
      title.onclick = null;
      if (title.style) title.style.cursor = '';
      title.setAttribute?.('role', 'heading');
      title.setAttribute?.('tabindex', '-1');
      title.textContent = conversation.title
        || (conversation.type === 'direct' ? 'Личная переписка' : 'Групповая беседа');
    }
    if (status) {
      status.textContent = isGroup ? 'Групповая беседа' : 'Личная переписка';
    }
    if (avatar && !avatar.querySelector?.('img')) {
      avatar.textContent = isGroup ? '♧' : '♙';
    }
  }

  openMobileShell() {
    if (this.disposed) return;
    const host = this.getEl('chatWindow');
    const sidebar = this.getEl('sidebar');
    host?.classList?.add?.('open', 'mobile-active');
    sidebar?.classList?.add?.('mobile-hidden');
  }

  ensureGroupSettingsButton(conversation) {
    if (this.disposed) return;
    const existing = this.getEl('rimGroupSettingsButton');
    existing?.remove?.();
    if (!conversation || conversation.type !== 'group') return;

    const head = this.document?.querySelector?.('#chatWindow .chat-head');
    if (!head) return;

    const button = this.document.createElement('button');
    button.id = 'rimGroupSettingsButton';
    button.type = 'button';
    button.className = 'icon-btn';
    button.title = 'Настройки группы';
    button.textContent = '⚙';
    const conversationId = conversation.id;
    button.addEventListener('click', event => {
      event.preventDefault();
      this.window?.rimOpenGroupSettings?.(conversationId);
    });
    head.append(button);
  }


  /**
   * Ensures the pinned-messages icon button exists in the chat head.
   * Idempotent: does not create a second button if one is already present.
   */
  ensurePinnedShortcut() {
    if (this.disposed) return;
    if (this.getEl('pinnedShortcut')) return;
    const head = this.document?.querySelector?.('#chatWindow .chat-head')
      || this.document?.querySelector?.('.chat-head');
    if (!head) return;
    const button = this.document.createElement('button');
    button.id = 'pinnedShortcut';
    button.type = 'button';
    button.className = 'icon-btn';
    button.textContent = '📌';
    button.title = 'Закреплённые';
    button.addEventListener('click', event => {
      event.preventDefault();
      const fn = this.window?.openPinnedMessages;
      if (typeof fn === 'function') fn();
    });
    head.append(button);
  }

  async applyGroupAvatar(conversation, { isCurrent = () => true } = {}) {
    if (this.disposed || !conversation || conversation.type !== 'group' || !conversation.avatar_path) {
      return null;
    }
    const sequence = ++this.avatarSequence;
    const avatar = this.getEl('chatHeadAvatar');
    if (!avatar || !this.client?.storage) return null;

    try {
      const { data, error } = await this.client.storage
        .from('avatars')
        .createSignedUrl(conversation.avatar_path, 1800);
      if (error) throw error;
      if (sequence !== this.avatarSequence || !isCurrent()) return null;
      if (data?.signedUrl) {
        avatar.innerHTML = `<img src="${escapeAttr(data.signedUrl)}" alt="Аватар группы" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`;
      }
      return data?.signedUrl || null;
    } catch (error) {
      this.logger?.warn?.('chat.shell.group_avatar.failed', { message: error?.message });
      return null;
    }
  }

  /**
   * Applies the synchronous shell immediately after conversation selection.
   * Async group avatar is started but not awaited by default callers that
   * continue into message loading.
   */
  applyAfterSelection(conversation, { isCurrent = () => true } = {}) {
    if (this.disposed || !conversation) return null;
    this.paintProvisionalHeader(conversation);
    this.openMobileShell();
    this.ensureGroupSettingsButton(conversation);
    this.ensurePinnedShortcut();
    const avatarTask = this.applyGroupAvatar(conversation, { isCurrent });
    try {
      this.window?.renderConversationList?.();
    } catch (error) {
      this.logger?.warn?.('chat.shell.list.refresh.failed', { message: error?.message });
    }
    return avatarTask;
  }

  dispose() {
    this.disposed = true;
    this.avatarSequence += 1;
    this.getEl('rimGroupSettingsButton')?.remove?.();
    this.getEl('pinnedShortcut')?.remove?.();
  }
}

function escapeAttr(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
