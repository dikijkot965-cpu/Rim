/**
 * Owns reply-bar UI and reply target selection for the composer.
 * State is written through the legacy compatibility setters when provided.
 */
export class ReplyTargetController {
  constructor({
    getMessages,
    setReplyTarget,
    documentRef = globalThis.document,
    logger = null
  } = {}) {
    this.getMessages = getMessages;
    this.setReplyTarget = setReplyTarget || (() => {});
    this.document = documentRef;
    this.logger = logger;
    this.disposed = false;
  }

  setReply(messageId) {
    if (this.disposed) return false;
    const rows = this.getMessages?.() || [];
    const message = rows.find(row => String(row.id) === String(messageId));
    if (!message) return false;

    this.setReplyTarget(message);
    const text = this.document?.getElementById?.('replyText');
    if (text) text.textContent = 'Ответ: ' + (message.body || 'Вложение');
    this.document?.getElementById?.('replyBar')?.classList?.remove?.('hidden');
    this.document?.getElementById?.('messageInput')?.focus?.();
    return true;
  }

  cancel() {
    if (this.disposed) return;
    this.setReplyTarget(null);
    this.document?.getElementById?.('replyBar')?.classList?.add?.('hidden');
    const text = this.document?.getElementById?.('replyText');
    if (text) text.textContent = '';
  }

  dispose() {
    this.disposed = true;
  }
}
