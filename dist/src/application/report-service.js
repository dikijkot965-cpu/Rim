import { Err, Ok } from '../core/result.js';

/**
 * User reports boundary over user_reports table.
 */
export class ReportService {
  constructor({
    client,
    getUser,
    notify = () => {},
    closeModal = null,
    documentRef = globalThis.document,
    showModal = null,
    windowRef = globalThis.window,
    logger = null
  } = {}) {
    this.client = client;
    this.getUser = getUser;
    this.notify = notify;
    this.closeModal = closeModal || (() => this.window?.closeModal?.());
    this.document = documentRef;
    this.showModal = showModal || ((html) => this.window?.showModal?.(html));
    this.window = windowRef;
    this.logger = logger;
  }

  openForm(prefill = {}) {
    const username = String(prefill.username || '').replace(/^@/, '');
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
    this.showModal(`<h2 class="modal-title">⚑ Жалоба</h2>
      <label class="field-label">На кого жалоба (username)</label>
      <input class="field" id="reportUsername" value="${esc(username)}" placeholder="username">
      <label class="field-label">Причина</label>
      <select class="field" id="reportReason">
        <option value="spam">Спам</option>
        <option value="harassment">Оскорбления или травля</option>
        <option value="scam">Мошенничество</option>
        <option value="inappropriate">Недопустимый контент</option>
        <option value="other">Другое</option>
      </select>
      <label class="field-label">Подробности</label>
      <textarea class="field" id="reportDetails" rows="4" placeholder="Опиши проблему"></textarea>
      <div class="modal-actions">
        <button class="action-btn" type="button" onclick="closeModal()">Отмена</button>
        <button class="primary-btn" type="button" onclick="submitReport()">Отправить</button>
      </div>`);
  }

  async submitFromDom() {
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Требуется вход в РИМ.'));
    const username = String(this.document.getElementById('reportUsername')?.value || '').trim().replace(/^@/, '');
    const reason = this.document.getElementById('reportReason')?.value || 'other';
    const details = String(this.document.getElementById('reportDetails')?.value || '').trim();
    if (!details) return Err(new Error('Добавь подробности жалобы.'));
    if (!username) return Err(new Error('Укажи username пользователя, на которого подаёшь жалобу.'));

    const { data: target, error: te } = await this.client
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();
    if (te) return Err(te);
    if (!target) return Err(new Error('Пользователь не найден.'));

    const { error } = await this.client.from('user_reports').insert({
      reporter_id: user.id,
      reported_user_id: target.id,
      reason,
      details
    });
    if (error) return Err(error);
    this.closeModal?.();
    this.notify('Жалоба передана модераторам.');
    return Ok(true);
  }

  async submitStructured({
    type = 'message',
    messageId = null,
    conversationId = null,
    channelId = null,
    commentId = null,
    reason,
    details
  } = {}) {
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Требуется вход в РИМ.'));
    const text = String(details ?? '').trim();
    const why = String(reason ?? 'other');
    if (!text) return Err(new Error('Добавьте подробности жалобы.'));

    const reportType = type === 'channel' ? 'channel'
      : type === 'comment' ? 'comment'
      : type === 'group' ? 'group'
      : 'message';

    const { error } = await this.client.from('user_reports').insert({
      reporter_id: user.id,
      reason: why,
      details: text,
      report_type: reportType,
      message_id: messageId || null,
      reported_conversation_id: conversationId || null,
      reported_channel_id: channelId || null,
      reported_comment_id: commentId || null
    });
    if (error) return Err(error);
    this.closeModal?.();
    this.notify('Жалоба передана модераторам.');
    return Ok(true);
  }
}
