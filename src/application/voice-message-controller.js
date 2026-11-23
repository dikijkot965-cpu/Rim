import { Err, Ok } from '../core/result.js';

/**
 * Owns voice-message recording UI and upload/send pipeline.
 * Keeps existing button id/classes for CSS compatibility.
 */
export class VoiceMessageController {
  constructor({
    client,
    e2eScopeRepository = null,
    getUser,
    getActiveConversation,
    notify = () => {},
    reloadMessages = async () => {},
    moveChatToTop = null,
    documentRef = globalThis.document,
    mediaDevices = globalThis.navigator?.mediaDevices,
    MediaRecorderImpl = globalThis.MediaRecorder,
    logger = null
  } = {}) {
    this.client = client;
    this.e2eScopeRepository = e2eScopeRepository;
    this.getUser = getUser;
    this.getActiveConversation = getActiveConversation;
    this.notify = notify;
    this.reloadMessages = reloadMessages;
    this.moveChatToTop = moveChatToTop;
    this.document = documentRef;
    this.mediaDevices = mediaDevices;
    this.MediaRecorderImpl = MediaRecorderImpl;
    this.logger = logger;

    this.recorder = null;
    this.recordStream = null;
    this.recordChunks = [];
    this.recordStart = 0;
    this.recordBtn = null;
    this.sending = false;
    this.disposed = false;
  }

  ensureButton() {
    // Prefer the single composer mic control to avoid duplicate gray buttons.
    const existing = this.document?.getElementById?.('rimVoiceBtn');
    if (existing && !existing.dataset.rimVoiceBound) {
      existing.dataset.rimVoiceBound = '1';
      existing.addEventListener('click', () => this.toggle());
      this.button = existing;
      return existing;
    }
    if (existing) { this.button = existing; return existing; }

    if (this.disposed) return null;
    const input = this.document?.getElementById?.('messageInput');
    if (!input) return null;
    let button = this.document.getElementById('rimReleaseVoiceBtn');
    if (button) {
      this.recordBtn = button;
      return button;
    }
    const composer = input.closest?.('.composer') || input.parentElement;
    button = this.document.createElement('button');
    button.type = 'button';
    button.id = 'rimReleaseVoiceBtn';
    button.className = 'rim-release-voice-btn';
    button.title = 'Записать голосовое сообщение';
    button.setAttribute('aria-label', 'Записать голосовое сообщение');
    button.textContent = '🎙';
    button.addEventListener('click', () => { void this.toggleRecording(); });
    composer?.insertBefore?.(button, input);
    this.recordBtn = button;
    return button;
  }

  async toggleRecording() {
    if (this.disposed) return;
    if (this.recorder && this.recorder.state === 'recording') {
      this.recorder.stop();
      return;
    }
    if (!this.mediaDevices?.getUserMedia || !this.MediaRecorderImpl) {
      this.notify('Запись голосовых не поддерживается этим браузером. Открой РИМ по HTTPS и разреши доступ к микрофону.');
      return;
    }

    try {
      this.recordStream = await this.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find(type => this.MediaRecorderImpl.isTypeSupported?.(type)) || '';
      this.recorder = new this.MediaRecorderImpl(this.recordStream, mime ? { mimeType: mime } : undefined);
      this.recordChunks = [];
      this.recordStart = Date.now();
      this.recorder.ondataavailable = event => {
        if (event.data?.size) this.recordChunks.push(event.data);
      };
      this.recorder.onstop = async () => {
        this.recordStream?.getTracks?.().forEach(track => track.stop());
        this.recordStream = null;
        this.recordBtn?.classList?.remove?.('recording');
        if (this.recordBtn) this.recordBtn.textContent = '🎙';
        const blob = new Blob(this.recordChunks, { type: this.recorder?.mimeType || 'audio/webm' });
        const duration = Math.max(1, Math.round((Date.now() - this.recordStart) / 1000));
        this.recorder = null;
        if (blob.size) await this.send(blob, duration);
      };
      this.recorder.start(250);
      this.recordBtn?.classList?.add?.('recording');
      if (this.recordBtn) this.recordBtn.textContent = '■';
      this.notify('Запись началась. Нажми ■, чтобы отправить.');
    } catch (error) {
      this.recordStream?.getTracks?.().forEach(track => track.stop());
      this.recordStream = null;
      this.notify('Не удалось начать запись: ' + (error?.message || error));
    }
  }

  async send(blob, durationSeconds) {
    if (this.disposed || this.sending) return Err(new Error('Отправка уже выполняется.'));
    const user = this.getUser?.();
    const conversation = this.getActiveConversation?.();
    if (!user?.id || !conversation?.id) {
      this.notify('Сначала открой переписку.');
      return Err(new Error('Сначала открой переписку.'));
    }

    const userId = String(user.id);
    const conversationId = String(conversation.id);
    const contextIsCurrent = () => String(this.getUser?.()?.id || '') === userId
      && String(this.getActiveConversation?.()?.id || '') === conversationId;
    const abortForContextChange = () => new Error('Аккаунт или открытая переписка изменились во время отправки голосового сообщения. Отправка остановлена.');

    this.sending = true;
    try {
      if (this.e2eScopeRepository && ['direct', 'group'].includes(conversation.type)) {
        if (conversation.type === 'group' && typeof conversation.is_private !== 'boolean') {
          this.sending = false;
          return Err(new Error('Не удалось подтвердить приватность группы. Голосовой файл не загружен.'));
        }
        const scopeInput = conversation.type === 'direct'
          ? { type: 'direct', id: conversation.id }
          : { type: 'group', id: conversation.id, is_private: conversation.is_private };
        const scope = await this.e2eScopeRepository.getScope(scopeInput, user.id);
        if (!contextIsCurrent()) { this.sending = false; return Err(abortForContextChange()); }
        if (!scope.ok) {
          this.sending = false;
          return Err(scope.error || new Error('Не удалось проверить E2E-режим голосового сообщения.'));
        }
        if (scope.value?.enabled) {
          this.sending = false;
          return Err(new Error('Эта переписка требует E2E. Голосовые сообщения пока не поддерживают защищённую отправку; файл не загружен.'));
        }
      }
    } catch (error) {
      this.sending = false;
      return Err(error);
    }

    if (!contextIsCurrent()) { this.sending = false; return Err(abortForContextChange()); }

    const id = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`);
    const ext = String(blob.type || '').includes('mp4') ? 'm4a' : 'webm';
    const path = `${userId}/${conversationId}/${id}.${ext}`;
    const mime = blob.type || 'audio/webm';

    try {
      const { error: up } = await this.client.storage.from('chat-files').upload(path, blob, {
        contentType: mime,
        upsert: false
      });
      if (up) throw up;
      if (!contextIsCurrent()) {
        await this.client.storage.from('chat-files').remove([path]);
        return Err(abortForContextChange());
      }

      const { data: msg, error: me } = await this.client
        .from('chat_messages')
        .insert({ conversation_id: conversationId, sender_id: userId, body: '' })
        .select('id,created_at')
        .single();
      if (me) throw me;
      if (!contextIsCurrent()) {
        try { await this.client.from('chat_messages').delete().eq('id', msg.id).eq('sender_id', userId); } catch { /* best-effort rollback */ }
        await this.client.storage.from('chat-files').remove([path]);
        return Err(abortForContextChange());
      }

      const { error: att } = await this.client.from('chat_message_attachments').insert({
        message_id: msg.id,
        storage_path: path,
        file_name: `Голосовое сообщение.${ext}`,
        mime_type: mime,
        media_kind: 'voice',
        byte_size: blob.size,
        duration_seconds: durationSeconds
      });
      if (att) {
        await this.client.from('chat_messages').delete().eq('id', msg.id).eq('sender_id', userId);
        await this.client.storage.from('chat-files').remove([path]);
        throw att;
      }
      if (!contextIsCurrent()) {
        try { await this.client.from('chat_messages').delete().eq('id', msg.id).eq('sender_id', userId); } catch { /* best-effort rollback */ }
        await this.client.storage.from('chat-files').remove([path]);
        return Err(abortForContextChange());
      }

      const { error: voice } = await this.client.from('chat_voice_messages').insert({
        conversation_id: conversationId,
        sender_id: userId,
        storage_path: path,
        duration_seconds: durationSeconds,
        waveform: []
      });
      if (voice) this.logger?.warn?.('voice.metadata.insert.failed', { message: voice.message });
      if (!contextIsCurrent()) return Err(abortForContextChange());

      await this.reloadMessages();
      try {
        this.moveChatToTop?.(conversationId, msg.created_at, 'Голосовое сообщение');
      } catch (error) {
        this.logger?.warn?.('voice.moveChatToTop.failed', { message: error?.message });
      }
      return Ok(msg);
    } catch (error) {
      this.notify('Не удалось отправить голосовое: ' + (error?.message || error));
      return Err(error);
    } finally {
      this.sending = false;
    }
  }

  dispose() {
    this.disposed = true;
    try { if (this.recorder && this.recorder.state === 'recording') this.recorder.stop(); } catch { /* ignore */ }
    this.recordStream?.getTracks?.().forEach(track => track.stop());
    this.recordStream = null;
    this.recorder = null;
  }
}
