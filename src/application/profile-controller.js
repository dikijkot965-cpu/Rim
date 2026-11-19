import { Err, Ok } from '../core/result.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

function initials(name) {
  const text = String(name || '?').trim();
  return (text.slice(0, 1) || '?').toUpperCase();
}

/**
 * Own profile open/save boundary.
 * Preserves imperial profile modal contract (fields + actions).
 */
export class ProfileController {
  constructor({
    client,
    getUser,
    getProfile,
    setProfile = null,
    isImperator = () => false,
    notify = () => {},
    showModal = null,
    closeModal = null,
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    logger = null
  } = {}) {
    this.client = client;
    this.getUser = getUser;
    this.getProfile = getProfile;
    this.setProfile = setProfile;
    this.isImperator = isImperator;
    this.notify = notify;
    this.showModal = showModal || ((html) => this.window?.showModal?.(html));
    this.closeModal = closeModal || (() => this.window?.closeModal?.());
    this.document = documentRef;
    this.window = windowRef;
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

  async ensureProfile() {
    const result = await this.loadProfile();
    if (!result.ok) return result;
    if (result.value && (result.value.id || result.value.username)) return result;
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Требуется вход в РИМ.'));
    const username = `user_${String(user.id).slice(0, 8)}`;
    const { data, error } = await this.client
      .from('profiles')
      .insert({ id: user.id, username, display_name: username })
      .select()
      .single();
    if (error) return Err(error);
    try { this.setProfile?.(data); } catch { /* ignore */ }
    return Ok(data);
  }

  async loadProfile() {
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Требуется вход в РИМ.'));
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (error) return Err(error);
    if (!data) return Ok(null);
    const profile = { ...(this.getProfile?.() || {}), ...(data || {}) };
    if (profile.avatar_path) {
      try {
        const { data: signed } = await this.client.storage.from('avatars').createSignedUrl(profile.avatar_path, 3600);
        if (signed?.signedUrl) {
          profile.avatar_url = signed.signedUrl;
          profile.avatar_display_url = signed.signedUrl;
        }
      } catch { /* ignore */ }
    }
    try { this.setProfile?.(profile); } catch { /* ignore */ }
    return Ok(profile);
  }

  async open() {
    const result = await this.loadProfile();
    if (!result.ok) {
      this.notify(result.error?.message || 'Не удалось загрузить профиль');
      return result;
    }
    const p = result.value || {};
    const avatar = p.avatar_display_url || p.avatar_url || '';
    const roleLine = this.isImperator?.()
      ? '⚜ Император'
      : `Участник № ${p.member_number ?? '—'}`;
    const name = p.display_name || p.username || 'Пользователь';
    const html = `
      <h2 class="modal-title">Мой профиль</h2>
      <div class="profile-block">
        <div class="avatar profile-avatar" id="rimProfileAvatarTap" style="position:relative;cursor:pointer" title="Нажмите, чтобы выбрать аватар">
          ${avatar ? `<img src="${escapeHtml(avatar)}" alt="">` : escapeHtml(initials(name))}
          <span style="position:absolute;right:-1px;bottom:-1px;background:var(--gold);color:#21180d;border-radius:50%;width:20px;height:20px;display:grid;place-items:center;font-size:12px">＋</span>
        </div>
        <div>
          <strong>${escapeHtml(name)}</strong>
          <div class="muted">@${escapeHtml(p.username || '')}</div>
          <div class="feature-small">${escapeHtml(roleLine)}</div>
        </div>
      </div>
      <label class="field-label">Отображаемое имя</label>
      <input class="field" id="editDisplayName" value="${escapeHtml(p.display_name || '')}">
      <label class="field-label">Username</label>
      <input class="field" id="editUsername" value="${escapeHtml(p.username || '')}">
      <label class="field-label">О себе</label>
      <textarea class="field" id="editBio" rows="3">${escapeHtml(p.bio || '')}</textarea>
      <label class="field-label">Цвет имени</label>
      <input class="field" id="editNameColor" type="color" value="${escapeHtml(p.name_color || '#c9a45d')}">
      <label class="field-label">Аватар</label>
      <input class="field" type="file" id="avatarFile" accept="image/jpeg,image/png,image/webp,image/gif">
      <div class="modal-actions">
        <button class="action-btn" type="button" onclick="closeModal()">Закрыть</button>
        <button class="primary-btn" type="button" onclick="saveProfile()">Сохранить</button>
      </div>
      <button class="action-btn" type="button" style="width:100%;margin-top:8px" onclick="openMemberCard?.()">Открыть удостоверение</button>
      <button class="action-btn danger-btn" type="button" style="width:100%;margin-top:8px" onclick="signOut()">Выйти из аккаунта</button>
    `;
    this.showModal(html);
    queueMicrotask(() => {
      const tap = this.document.getElementById('rimProfileAvatarTap');
      tap?.addEventListener?.('click', () => this.document.getElementById('avatarFile')?.click());
    });
    return result;
  }

  async saveFromDom() {
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Требуется вход в РИМ.'));

    const displayName = String(this.document.getElementById('editDisplayName')?.value || '').trim();
    const username = String(this.document.getElementById('editUsername')?.value || '').trim().toLowerCase();
    const bio = String(this.document.getElementById('editBio')?.value || '').trim();
    const nameColor = this.document.getElementById('editNameColor')?.value || null;
    const file = this.document.getElementById('avatarFile')?.files?.[0] || null;

    if (!/^[a-z0-9_]{3,24}$/i.test(username)) {
      return Err(new Error('Username должен содержать 3–24 символа: латиница, цифры, _.'));
    }

    return this.exclusive('profile-save', async () => {
      const patch = {
        display_name: displayName,
        username,
        bio
      };
      if (nameColor) patch.name_color = nameColor;

      if (file) {
        if (file.size > 3 * 1024 * 1024) return Err(new Error('Аватар должен быть не больше 3 МБ.'));
        const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: up } = await this.client.storage.from('avatars').upload(path, file, {
          contentType: file.type || 'image/jpeg',
          upsert: false
        });
        if (up) return Err(up);
        patch.avatar_path = path;
      }

      const { data, error } = await this.client
        .from('profiles')
        .update(patch)
        .eq('id', user.id)
        .select()
        .single();
      if (error) return Err(error);

      const next = { ...(this.getProfile?.() || {}), ...data };
      if (next.avatar_path) {
        try {
          const { data: signed } = await this.client.storage.from('avatars').createSignedUrl(next.avatar_path, 3600);
          if (signed?.signedUrl) {
            next.avatar_url = signed.signedUrl;
            next.avatar_display_url = signed.signedUrl;
          }
        } catch { /* ignore */ }
      }
      try { this.setProfile?.(next); } catch { /* ignore */ }
      this.closeModal?.();
      this.notify('Профиль сохранён.');
      return Ok(next);
    });
  }
}
