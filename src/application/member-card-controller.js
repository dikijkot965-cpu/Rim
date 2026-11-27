import { Err, Ok } from '../core/result.js';

/**
 * Imperial member credential card.
 */
export class MemberCardController {
  constructor({
    client,
    getUser,
    getProfile = () => null,
    notify = () => {},
    showModal = null,
    windowRef = globalThis.window,
    logger = null
  } = {}) {
    this.client = client;
    this.getUser = getUser;
    this.getProfile = getProfile;
    this.notify = notify;
    this.showModal = showModal || ((html) => this.window?.showModal?.(html));
    this.window = windowRef;
    this.logger = logger;
  }

  #esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  }

  async open() {
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Требуется вход в РИМ.'));
    const { data, error } = await this.client
      .from('profiles')
      .select('username,display_name,member_number,created_at,name_color')
      .eq('id', user.id)
      .maybeSingle();
    if (error) return Err(error);
    const p = data || this.getProfile?.() || {};
    let created = '—';
    try {
      if (p.created_at) created = new Date(p.created_at).toLocaleDateString('ru-RU');
    } catch { /* ignore */ }
    const name = this.#esc(p.display_name || p.username || 'Участник');
    const number = p.member_number ?? 'Не присвоен';
    this.showModal(`<h2 class="modal-title">🪪 Имперское удостоверение</h2>
      <div class="member-id">
        <span class="seal">⚜</span>
        <div class="serial">RIM · MEMBER</div>
        <h2 style="color:var(--gold2);margin:12px 0 5px">${name}</h2>
        <div>@${this.#esc(p.username || '')}</div>
        <hr style="border-color:var(--border);margin:14px 0">
        <div class="serial">РЕГИСТРАЦИОННЫЙ НОМЕР</div>
        <div style="font-size:23px;font-weight:bold;margin:5px 0">${this.#esc(number)}</div>
        <div class="feature-small">В системе с ${this.#esc(created)}</div>
      </div>
      <button class="primary-btn" style="width:100%;margin-top:12px" type="button" onclick="closeModal()">Закрыть</button>`);
    return Ok(p);
  }
}
