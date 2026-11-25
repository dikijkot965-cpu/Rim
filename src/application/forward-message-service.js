import { Err, Ok } from '../core/result.js';

/**
 * Forward message into another conversation the user belongs to.
 */
export class ForwardMessageService {
  constructor({
    client,
    e2eScopeRepository = null,
    getUser,
    getMessages = () => [],
    getConversations = () => [],
    getActiveConversation = () => null,
    notify = () => {},
    closeModal = null,
    showModal = null,
    reloadMessages = async () => {},
    windowRef = globalThis.window,
    documentRef = globalThis.document,
    logger = null
  } = {}) {
    this.client = client;
    this.e2eScopeRepository = e2eScopeRepository;
    this.getUser = getUser;
    this.getMessages = getMessages;
    this.getConversations = getConversations;
    this.getActiveConversation = getActiveConversation;
    this.notify = notify;
    this.closeModal = closeModal || (() => this.window?.closeModal?.());
    this.showModal = showModal || ((html) => this.window?.showModal?.(html));
    this.reloadMessages = reloadMessages;
    this.window = windowRef;
    this.document = documentRef;
    this.logger = logger;
    this.inFlight = new Set();
  }

  async exclusive(key, operation) {
    if (this.inFlight.has(key)) return Err(new Error('Операция уже выполняется.'));
    this.inFlight.add(key);
    try { return await operation(); }
    catch (error) { return Err(error); }
    finally { this.inFlight.delete(key); }
  }

  chooseTarget(messageId) {
    const activeId = this.getActiveConversation?.()?.id;
    const chats = (this.getConversations?.() || []).filter(c => ['direct', 'group'].includes(c?.type) && String(c.id) !== String(activeId));
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
    const id = esc(messageId);
    const list = chats.map(c => {
      const peer = c.other_profile || c.peer_profile || null;
      const title = esc(c.type === 'direct' ? (peer?.display_name?.trim() || peer?.username?.trim() || c.title?.trim() || 'Пользователь без имени') : (c.title?.trim() || 'Группа без названия'));
      const kind = c.type === 'group' ? 'Групповая беседа' : (peer?.username ? 'Личный чат · @' + esc(peer.username) : 'Личный чат');
      return `<button class="rim-search-result-card" style="width:100%;color:var(--text)" type="button" onclick="rimForwardMessage('${id}','${esc(c.id)}')">
        <span class="grow"><b>${title}</b><small class="rim-update-muted">${kind}</small></span><span>›</span></button>`;
    }).join('') || '<div class="empty-state">Нет других переписок.</div>';

    this.showModal(`<h2 class="modal-title">Переслать сообщение</h2>
      <label class="rim-forward-hide"><input type="checkbox" id="rimForwardHideSender"> Скрыть имя исходного отправителя</label>
      <div class="rim-update-muted">Получатель увидит текст и вложения. При включённой опции вместо имени будет показано «Пересланное сообщение».</div>
      ${list}`);
  }

  async forward(messageId, conversationId, hideSender = false) {
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Требуется вход в РИМ.'));
    if (!messageId || !conversationId) return Err(new Error('Не указано сообщение или чат.'));

    return this.exclusive(`forward:${messageId}:${conversationId}`, async () => {
      const source = (this.getMessages?.() || []).find(row => String(row.id) === String(messageId));
      if (!source) return Err(new Error('Исходное сообщение не найдено.'));
      if (source._rimLocalOnly === true || source._rimE2E === true) return Err(new Error('Пересылка E2E-сообщений пока не подключена; открытый текст не будет скопирован в другую переписку.'));

      const { data: member, error: me } = await this.client
        .from('conversation_members')
        .select('conversation_id')
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (me) return Err(me);
      if (!member) return Err(new Error('Нет доступа к выбранному чату.'));

      if (this.e2eScopeRepository) {
        const targetResult = await this.client.from('conversations')
          .select('id,type,is_private').eq('id', conversationId).maybeSingle();
        if (targetResult.error) return Err(targetResult.error);
        if (!targetResult.data) return Err(new Error('Не удалось проверить режим целевой переписки.'));
        const target = targetResult.data;
        if (!['direct', 'group'].includes(target.type)) return Err(new Error('Тип целевой переписки не распознан; пересылка остановлена.'));
        if (target.type === 'group' && typeof target.is_private !== 'boolean') return Err(new Error('Не удалось подтвердить приватность целевой группы; пересылка остановлена.'));
        {
          const scopeInput = target.type === 'direct'
            ? { type: 'direct', id: target.id }
            : { type: 'group', id: target.id, is_private: target.is_private };
          const scope = await this.e2eScopeRepository.getScope(scopeInput, user.id);
          if (!scope.ok) return Err(scope.error || new Error('Не удалось проверить E2E целевой переписки.'));
          if (scope.value?.enabled) return Err(new Error('Целевая переписка требует E2E. Пересылка через открытый серверный механизм запрещена.'));
        }
      }

      const payload = {
        conversation_id: conversationId,
        sender_id: user.id,
        body: source.body || '',
        sticker_id: source.sticker_id || null,
        forwarded_from_user_id: source.forwarded_from_user_id || source.sender_id,
        forwarded_from_message_id: source.forwarded_from_message_id || source.id,
        forwarded_hide_sender: !!hideSender
      };

      const copiedPaths = [];
      const fileExt = (name) => {
        const x = String(name || 'file').split('.').pop().toLowerCase();
        return /^[a-z0-9]{1,8}$/.test(x) ? x : 'bin';
      };
      const clonePath = async (path, name) => {
        if (!path) return null;
        const target = `${user.id}/${conversationId}/${crypto.randomUUID()}.${fileExt(name || path)}`;
        const { error: copyError } = await this.client.storage.from('chat-files').copy(path, target);
        if (copyError) throw copyError;
        copiedPaths.push(target);
        return target;
      };

      try {
        if (source.image_path) {
          payload.image_path = await clonePath(source.image_path, source.image_path);
        }
        if (source.attachment_path) {
          payload.attachment_path = await clonePath(source.attachment_path, source.attachment_name || source.attachment_path);
          for (const key of ['attachment_name', 'attachment_mime_type', 'attachment_size', 'attachment_kind', 'duration_seconds', 'width', 'height']) {
            if (source[key] !== undefined && source[key] !== null) payload[key] = source[key];
          }
        }

        const { data, error } = await this.client
          .from('chat_messages')
          .insert(payload)
          .select('id,conversation_id,created_at')
          .single();
        if (error) throw error;

        const { data: rows, error: attError } = await this.client
          .from('chat_message_attachments')
          .select('*')
          .eq('message_id', source.id);
        if (!attError && rows?.length) {
          for (const row of rows) {
            const path = await clonePath(row.storage_path, row.file_name);
            const { error: metaError } = await this.client.from('chat_message_attachments').insert({
              message_id: data.id,
              storage_path: path,
              file_name: row.file_name,
              mime_type: row.mime_type,
              media_kind: row.media_kind,
              byte_size: row.byte_size,
              duration_seconds: row.duration_seconds,
              width: row.width,
              height: row.height
            });
            if (metaError) throw metaError;
          }
        }

        this.closeModal?.();
        this.notify(hideSender ? 'Сообщение переслано без имени отправителя.' : 'Сообщение переслано.');
        if (String(this.getActiveConversation?.()?.id) === String(conversationId)) {
          await this.reloadMessages();
        }
        return Ok(data);
      } catch (error) {
        if (copiedPaths.length) {
          try { await this.client.storage.from('chat-files').remove(copiedPaths); } catch { /* ignore cleanup */ }
        }
        return Err(error);
      }
    });
  }
}
