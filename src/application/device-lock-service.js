const STORAGE_KEY = 'rim.device-lock.v1';
const PBKDF2_ITERATIONS = 310_000;
const encoder = new TextEncoder();

function toHex(bytes) { return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join(''); }
function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}
function normalizePattern(value) { return String(value || '').replace(/[^1-9]/g, '').slice(0, 9); }
function normalizeTimeout(value) { const number=Number(value); if (number===15) return 10; if (number===60) return 30; return [0, 1, 5, 10, 30].includes(number) ? number : 5; }

/** Local privacy lock. It does not replace Supabase authentication. */
export class DeviceLockService {
  constructor({ documentRef = globalThis.document, windowRef = globalThis.window,
    storage = globalThis.localStorage, cryptoRef = globalThis.crypto, notify = null, client = null } = {}) {
    this.document = documentRef; this.window = windowRef; this.storage = storage; this.crypto = cryptoRef;
    this.notify = notify || (message => this.window?.toast?.(message)); this.client = client;
    this.config = this.readConfig(); this.overlay = null; this.pattern = ''; this.hiddenAt = 0;
    this.authSubscription = null; this.bound = false;
    this.visibilityHandler = () => this.onVisibilityChange();
    this.pageHideHandler = () => this.recordBackground();
  }

  readConfig() {
    try {
      const value = JSON.parse(this.storage?.getItem(STORAGE_KEY) || 'null');
      if (!value || value.version !== 1 || !['pin', 'pattern'].includes(value.mode) ||
          typeof value.salt !== 'string' || typeof value.verifier !== 'string') return null;
      return { ...value, autoLockMinutes: normalizeTimeout(value.autoLockMinutes),
        failedAttempts: Math.max(0, Number(value.failedAttempts) || 0),
        blockedUntil: Math.max(0, Number(value.blockedUntil) || 0),
        lastBackgroundAt: Math.max(0, Number(value.lastBackgroundAt) || 0),
        pinLength: Math.max(0, Number(value.pinLength) || 0) };
    } catch { return null; }
  }

  async derive(secret, salt) {
    if (!this.crypto?.subtle || !this.crypto?.getRandomValues) throw new Error('Web Crypto недоступен. Откройте RIM через HTTPS.');
    const key = await this.crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveBits']);
    const bits = await this.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256);
    return toHex(new Uint8Array(bits));
  }

  normalizeSecret(mode, secret) {
    if (mode === 'pin') {
      const value = String(secret || '');
      if (!/^\d{4}$/.test(value)) throw new Error('Код-пароль должен содержать ровно 4 цифры.');
      return value;
    }
    if (mode === 'pattern') {
      const value = normalizePattern(secret);
      if (value.length < 6 || new Set(value).size < 6) throw new Error('Графический ключ должен включать минимум 6 разных точек.');
      return value;
    }
    throw new Error('Неизвестный тип блокировки.');
  }

  async matches(secret) {
    if (!this.config) return true;
    const normalized = this.config.mode === 'pattern' ? normalizePattern(secret) : String(secret || '');
    const salt = Uint8Array.from(this.config.salt.match(/.{2}/g).map(part => parseInt(part, 16)));
    return safeEqual(await this.derive(`${this.config.mode}:${normalized}`, salt), this.config.verifier);
  }

  async assertNotRateLimited() {
    const now = Date.now();
    if (now < (this.config?.blockedUntil || 0)) {
      throw new Error(`Слишком много попыток. Подождите ${Math.ceil((this.config.blockedUntil - now) / 1000)} сек.`);
    }
  }

  async verifyCurrent(secret) {
    if (!this.config) return true;
    await this.assertNotRateLimited();
    if (!await this.matches(secret)) {
      const attempts = (this.config.failedAttempts || 0) + 1;
      const delay = attempts < 4 ? 0 : Math.min(15 * 60_000, 30_000 * (2 ** (attempts - 4)));
      this.config.failedAttempts = attempts; this.config.blockedUntil = Date.now() + delay; this.persist();
      throw new Error(delay ? `Неверный ключ. Новая попытка через ${Math.ceil(delay / 1000)} сек.` : 'Неверный код или графический ключ.');
    }
    this.config.failedAttempts = 0; this.config.blockedUntil = 0; this.persist();
    return true;
  }

  async configure(mode, secret, autoLockMinutes = 5, currentSecret = '') {
    const normalized = this.normalizeSecret(mode, secret);
    if (this.config) await this.verifyCurrent(currentSecret);
    const salt = this.crypto.getRandomValues(new Uint8Array(16));
    const verifier = await this.derive(`${mode}:${normalized}`, salt);
    this.config = { version: 1, mode, salt: toHex(salt), verifier,
      autoLockMinutes: normalizeTimeout(autoLockMinutes), failedAttempts: 0, blockedUntil: 0, lastBackgroundAt: 0, pinLength: mode === 'pin' ? 4 : 0 };
    this.persist();
    this.notify?.(mode === 'pin' ? 'Четырёхзначный код-пароль приложения включён.' : 'Графический ключ приложения включён.');
    return true;
  }

  persist() {
    if (!this.config) { this.storage?.removeItem(STORAGE_KEY); return; }
    const { version, mode, salt, verifier, autoLockMinutes, failedAttempts, blockedUntil, lastBackgroundAt, pinLength } = this.config;
    this.storage?.setItem(STORAGE_KEY, JSON.stringify({ version, mode, salt, verifier, autoLockMinutes, failedAttempts, blockedUntil, lastBackgroundAt, pinLength }));
  }

  async verify(secret) {
    if (!this.config) return true;
    await this.verifyCurrent(secret);
    this.config.lastBackgroundAt = 0; this.persist(); this.unlock();
    return true;
  }

  async remove(secret) {
    if (this.config) await this.verifyCurrent(secret);
    this.config = null; this.storage?.removeItem(STORAGE_KEY); this.unlock();
    this.notify?.('Блокировка приложения отключена на этом устройстве.');
    return true;
  }

  recordBackground() {
    if (!this.config || this.config.autoLockMinutes <= 0) return;
    this.hiddenAt = Date.now(); this.config.lastBackgroundAt = this.hiddenAt; this.persist();
  }

  shouldLockSince(timestamp, now = Date.now()) {
    if (!this.config || this.config.autoLockMinutes <= 0 || !timestamp) return false;
    return now - timestamp >= this.config.autoLockMinutes * 60_000;
  }

  start() {
    if (this.bound) return;
    this.bound = true;
    this.document?.addEventListener?.('visibilitychange', this.visibilityHandler);
    this.window?.addEventListener?.('pagehide', this.pageHideHandler);
    // Do not lock on every SIGNED_IN event: returning from another screen or
    // refreshing a valid session must respect the configured grace period.
    const previousBackground = this.config?.lastBackgroundAt || 0;
    if (this.shouldLockSince(previousBackground)) this.lockNow();
    if (this.config) { this.config.lastBackgroundAt = 0; this.persist(); }
  }

  onVisibilityChange() {
    if (!this.config) return;
    if (this.document?.hidden) { this.recordBackground(); return; }
    const since = this.hiddenAt || this.config.lastBackgroundAt;
    if (this.shouldLockSince(since)) this.lockNow();
    this.hiddenAt = 0;
    this.config.lastBackgroundAt = 0; this.persist();
  }

  lockNow() {
    if (!this.config || this.overlay || !this.document?.body) return;
    this.pattern = ''; const isPattern = this.config.mode === 'pattern';
    this.overlay = this.document.createElement('div'); this.overlay.className = 'rim-device-lock-overlay';
    this.overlay.setAttribute('role', 'dialog'); this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.innerHTML = `<section class="rim-device-lock-card"><div class="rim-device-lock-mark">⚜</div><h2>RIM заблокирован</h2><p>${isPattern ? 'Нарисуйте графический ключ на сетке.' : 'Введите четырёхзначный код-пароль.'}</p>${isPattern ? `<div class="rim-device-lock-grid">${Array.from({length:9},(_,i)=>`<button type="button" data-lock-dot="${i+1}" aria-label="Точка ${i+1}">${i+1}</button>`).join('')}</div><div class="rim-device-lock-sequence" data-lock-sequence>Ключ не введён</div>` : `<input class="field" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="${this.config.pinLength || 16}" data-lock-pin placeholder="${this.config.pinLength === 4 ? '4 цифры' : 'Код-пароль'}"/>`}<div class="rim-device-lock-error" data-lock-error aria-live="polite"></div><button class="primary-btn" type="button" data-lock-unlock>Разблокировать</button>${isPattern ? `<button class="action-btn" type="button" data-lock-clear>Очистить</button>` : ''}</section>`;
    this.overlay.addEventListener('click', event => {
      const dot = event.target?.closest?.('[data-lock-dot]');
      if (dot) { const value = String(dot.dataset.lockDot); if (!this.pattern.includes(value)) this.pattern += value; dot.classList.add('selected'); const label = this.overlay.querySelector('[data-lock-sequence]'); if (label) label.textContent = `Выбрано точек: ${this.pattern.length}`; }
      if (event.target?.closest?.('[data-lock-clear]')) { this.pattern = ''; this.overlay.querySelectorAll('[data-lock-dot]').forEach(node => node.classList.remove('selected')); const label = this.overlay.querySelector('[data-lock-sequence]'); if (label) label.textContent = 'Ключ не введён'; }
      if (event.target?.closest?.('[data-lock-unlock]')) {
        const value = isPattern ? this.pattern : this.overlay.querySelector('[data-lock-pin]')?.value || '';
        void this.verify(value).catch(error => { const output = this.overlay?.querySelector('[data-lock-error]'); if (output) output.textContent = error?.message || 'Не удалось разблокировать RIM.'; this.pattern = ''; this.overlay?.querySelectorAll('[data-lock-dot]')?.forEach(node => node.classList.remove('selected')); const pin = this.overlay?.querySelector('[data-lock-pin]'); if (pin) { pin.value = ''; pin.focus(); } });
      }
    });
    this.document.body.append(this.overlay); this.overlay.querySelector('[data-lock-pin]')?.focus?.();
  }

  unlock() { this.overlay?.remove?.(); this.overlay = null; this.pattern = ''; }

  openSettings() {
    const timeout = this.config?.autoLockMinutes ?? 5;
    const currentPlaceholder = this.config?.mode === 'pin' ? 'Текущий PIN (4 цифры)' : 'Текущий графический ключ';
    const html = `<h2 class="modal-title">Блокировка приложения</h2><div class="rim-device-lock-note"><b>Локальная защита экрана</b><p>Четырёхзначный код скрывает приложение. После ухода в фон RIM запросит его только по истечении выбранного времени. Это локальный барьер, а не серверная авторизация; очистка данных браузера может сбросить его.</p></div><label class="field-label">Автоматическая блокировка</label><select class="field" id="rimDeviceLockTimeout"><option value="0" ${timeout===0?'selected':''}>Отключена</option><option value="1" ${timeout===1?'selected':''}>Через 1 минуту</option><option value="5" ${timeout===5?'selected':''}>Через 5 минут</option><option value="10" ${timeout===10?'selected':''}>Через 10 минут</option><option value="30" ${timeout===30?'selected':''}>Через 30 минут</option></select>${this.config ? `<label class="field-label">Текущий код/ключ для изменения настроек</label><input class="field" id="rimDeviceLockCurrentSecret" type="password" autocomplete="off" placeholder="${currentPlaceholder}"/>` : ''}<h3>Новый код-пароль</h3><input class="field" id="rimDeviceLockPin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="new-password" placeholder="Ровно 4 цифры"/><input class="field" id="rimDeviceLockPinConfirm" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="new-password" placeholder="Повторите код"/><button class="primary-btn" style="width:100%;margin-top:7px" type="button" data-lock-save-pin>${this.config?.mode==='pin'?'Изменить PIN':'Установить PIN'}</button><h3 style="margin-top:18px">Графический ключ</h3><p class="muted">Нажмите минимум 6 разных точек по порядку.</p><div class="rim-device-lock-grid rim-device-lock-setup-grid">${Array.from({length:9},(_,i)=>`<button type="button" data-setup-dot="${i+1}">${i+1}</button>`).join('')}</div><div class="rim-device-lock-sequence" data-setup-sequence>Ключ не введён</div><button class="action-btn" type="button" data-setup-clear>Очистить рисунок</button><button class="primary-btn" style="width:100%;margin-top:7px" type="button" data-lock-save-pattern>Установить графический ключ</button>${this.config ? `<button class="action-btn" style="width:100%;margin-top:12px" type="button" data-lock-now>Заблокировать сейчас</button><button class="action-btn" style="width:100%;margin-top:8px" type="button" data-lock-remove>Отключить блокировку</button>` : ''}`;
    this.window?.showModal?.(html); const modal = this.document?.querySelector?.('#modalRoot .modal'); let setupPattern = '';
    modal?.addEventListener?.('click', event => {
      const dot = event.target?.closest?.('[data-setup-dot]');
      if (dot && modal.contains(dot)) { const value = String(dot.dataset.setupDot); if (!setupPattern.includes(value)) setupPattern += value; dot.classList.add('selected'); const label = modal.querySelector('[data-setup-sequence]'); if (label) label.textContent = `Выбрано точек: ${setupPattern.length}`; }
      if (event.target?.closest?.('[data-setup-clear]')) { setupPattern = ''; modal.querySelectorAll('[data-setup-dot]').forEach(node => node.classList.remove('selected')); const label = modal.querySelector('[data-setup-sequence]'); if (label) label.textContent = 'Ключ не введён'; }
      const currentSecret = modal.querySelector('#rimDeviceLockCurrentSecret')?.value || '';
      if (event.target?.closest?.('[data-lock-save-pin]')) {
        const pin = modal.querySelector('#rimDeviceLockPin')?.value || ''; const confirm = modal.querySelector('#rimDeviceLockPinConfirm')?.value || '';
        if (pin !== confirm) { this.notify?.('Коды не совпадают.'); return; }
        void this.configure('pin', pin, modal.querySelector('#rimDeviceLockTimeout')?.value, currentSecret).then(() => this.window?.closeModal?.()).catch(error => this.notify?.(error.message));
      }
      if (event.target?.closest?.('[data-lock-save-pattern]')) void this.configure('pattern', setupPattern, modal.querySelector('#rimDeviceLockTimeout')?.value, currentSecret).then(() => this.window?.closeModal?.()).catch(error => this.notify?.(error.message));
      if (event.target?.closest?.('[data-lock-now]')) { this.window?.closeModal?.(); this.lockNow(); }
      if (event.target?.closest?.('[data-lock-remove]')) void this.remove(currentSecret).then(() => this.window?.closeModal?.()).catch(error => this.notify?.(error.message));
    });
  }

  dispose() { this.window?.removeEventListener?.('pagehide', this.pageHideHandler); this.document?.removeEventListener?.('visibilitychange', this.visibilityHandler); this.unlock(); this.bound = false; }
}
