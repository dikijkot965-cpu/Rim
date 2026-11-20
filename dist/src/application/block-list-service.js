import { Err, Ok } from '../core/result.js';

/**
 * User block list boundary over user_blocks + profiles.
 */
export class BlockListService {
  constructor({
    client,
    getUser,
    notify = () => {},
    showModal = null,
    prompt = globalThis.prompt?.bind(globalThis),
    windowRef = globalThis.window,
    logger = null
  } = {}) {
    this.client = client;
    this.getUser = getUser;
    this.notify = notify;
    this.showModal = showModal || ((html) => this.window?.showModal?.(html));
    this.prompt = prompt || (() => null);
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

  #esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  }

  async list() {
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Требуется вход в РИМ.'));

    const { data, error } = await this.client
      .from('user_blocks')
      .select('blocked_id,created_at')
      .eq('blocker_id', user.id)
      .order('created_at', { ascending: false });
    if (error) return Err(error);

    const ids = (data || []).map(row => row.blocked_id).filter(Boolean);
    let profiles = [];
    if (ids.length) {
      const response = await this.client
        .from('profiles')
        .select('id,username,display_name')
        .in('id', ids);
      if (response.error) return Err(response.error);
      profiles = response.data || [];
    }
    const map = Object.fromEntries(profiles.map(profile => [profile.id, profile]));
    return Ok({ rows: data || [], profiles: map });
  }

  async open() {
    const result = await this.list();
    if (!result.ok) {
      this.notify(result.error?.message || 'Не удалось загрузить чёрный список');
      return result;
    }
    const { rows, profiles } = result.value;
    const body = rows.map(row => {
      const profile = profiles[row.blocked_id] || {};
      const id = this.#esc(row.blocked_id);
      const name = this.#esc(profile.display_name || profile.username || 'Пользователь');
      const username = this.#esc(profile.username || '');
      return `<div class="settings-row"><span>${name} <small>@${username}</small></span>
        <button class="action-btn" type="button" onclick="rimRemoveBlock('${id}')">Разблокировать</button></div>`;
    }).join('') || '<div class="empty-state">Список пуст.</div>';

    this.showModal(`<h2 class="modal-title">Заблокированные пользователи</h2>
      <button class="primary-btn" style="width:100%" type="button" onclick="rimAddBlock()">＋ Заблокировать пользователя</button>
      ${body}
      <button class="action-btn" style="width:100%" type="button" onclick="closeModal()">Закрыть</button>`);
    return result;
  }

  async addByUsername(username) {
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Требуется вход в РИМ.'));
    const name = String(username ?? '').trim().replace(/^@/, '');
    if (!name) return Ok({ cancelled: true });

    return this.exclusive(`block:${name}`, async () => {
      const { data: profile, error } = await this.client
        .from('profiles')
        .select('id,username')
        .eq('username', name)
        .maybeSingle();
      if (error) return Err(error);
      if (!profile) return Err(new Error('Пользователь не найден.'));
      if (String(profile.id) === String(user.id)) {
        return Err(new Error('Нельзя заблокировать собственный аккаунт.'));
      }

      const { error: insertError } = await this.client.from('user_blocks').insert({
        blocker_id: user.id,
        blocked_id: profile.id
      });
      if (insertError && !String(insertError.message || '').toLowerCase().includes('duplicate')) {
        return Err(insertError);
      }
      return this.open();
    });
  }

  async remove(blockedId) {
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Требуется вход в РИМ.'));
    if (!blockedId) return Err(new Error('Не указан пользователь.'));

    return this.exclusive(`unblock:${blockedId}`, async () => {
      const { error } = await this.client
        .from('user_blocks')
        .delete()
        .eq('blocker_id', user.id)
        .eq('blocked_id', blockedId);
      if (error) return Err(error);
      return this.open();
    });
  }

  async promptAdd() {
    const name = this.prompt('Username пользователя для блокировки:');
    if (name === null) return Ok({ cancelled: true });
    return this.addByUsername(name);
  }
}
