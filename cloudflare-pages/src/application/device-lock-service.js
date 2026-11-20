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
function normalizePattern(value) {
  return String(value || '').replace(/[^1-9]/g, '').slice(0, 9);
}

/**
 * Optional on-device screen lock. This is a privacy barrier, not account
 * authentication: it does not revoke Supabase tokens or protect against a
 * person who can clear browser storage / inspect the running browser profile.
 */
export class DeviceLockService {
  constructor({ documentRef = globalThis.document, windowRef = globalThis.window,
    storage = globalThis.localStorage, cryptoRef = globalThis.crypto, notify = null, client = null } = {}) {
    this.document = documentRef;
    this.window = windowRef;
    this.storage = storage;
    this.crypto = cryptoRef;
    this.notify = notify || (message => this.window?.toast?.(message));
    this.client = client;
    this.config = this.readConfig();
    this.overlay = null;
    this.pattern = '';
    this.hiddenAt = 0;
    this.authSubscription = null;
    this.visibilityHandler = () => this.onVisibilityChange();
    this.bound = false;
  }

  readConfig() {
    try {
      const value = JSON.parse(this.storage?.getItem(STORAGE_KEY) || 'null');
      if (!value || value.version !== 1 || !['pin', 'pattern'].includes(value.mode) ||
          typeof value.salt !== 'string' || typeof value.verifier !== 'string') return null;
      return { ...value, autoLockMinutes: Math.min(60, Math.max(0, Number(value.autoLockMinutes) || 0)), failedAttempts: Math.max(0, Number(value.failedAttempts) || 0), blockedUntil: Math.max(0, Number(value.blockedUntil) || 0) };
    } catch { return null; }
  }

  async derive(secret, salt) {
    if (!this.crypto?.subtle || !this.crypto?.getRandomValues) throw new Error('Web Crypto недоступен. Откройте RIM через HTTPS.');
    const key = await this.crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveBits']);
    const bits = await this.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256);
    return toHex(new Uint8Array(bits));
  }

  async configure(mode, secret, autoLockMinutes = 1) {
    let normalized = String(secret || '');
    if (mode === 'pin') {
      if (!/^\d{8,16}$/.test(normalized)) throw new Error('Код-пароль должен содержать от 8 до 16 цифр.');
    } else if (mode === 'pattern') {
      normalized = normalizePattern(normalized);
      if (normalized.length < 6 || new Set(normalized).size < 6) throw new Error('Графический ключ должен включать минимум 6 разных точек.');
    } else throw new Error('Неизвестный тип блокировки.');

    const salt = this.crypto.getRandomValues(new Uint8Array(16));
    const verifier = await this.derive(`${mode}:${normalized}`, salt);
    this.config = {
      version: 1,
      mode,
      salt: toHex(salt),
      verifier,
      autoLockMinutes: Math.min(60, Math.max(0, Number(autoLockMinutes) || 0)),
      failedAttempts: 0,
      blockedUntil: 0
    };
    this.persist();
    this.notify?.(mode === 'pin' ? 'Код-пароль приложения включён на этом устройстве.' : 'Графический ключ приложения включён на этом устройстве.');
    return true;
  }

  persist() {
    if (!this.config) { this.storage?.removeItem(STORAGE_KEY); return; }
    const { version, mode, salt, verifier, autoLockMinutes, failedAttempts, blockedUntil } = this.config;
    this.storage?.setItem(STORAGE_KEY, JSON.stringify({ version, mode, salt, verifier, autoLockMinutes, failedAttempts, blockedUntil }));
  }

  async verify(secret) {
    if (!this.config) return true;
    const now = Date.now();
    if (now < (this.config.blockedUntil || 0)) {
      const seconds = Math.ceil((this.config.blockedUntil - now) / 1000);
      throw new Error(`Слишком много попыток. Подождите ${seconds} сек.`);
    }
    const normalized = this.config.mode === 'pattern' ? normalizePattern(secret) : String(secret || '');
    const salt = Uint8Array.from(this.config.salt.match(/.{2}/g).map(part => parseInt(part, 16)));
    const candidate = await this.derive(`${this.config.mode}:${normalized}`, salt);
    if (!safeEqual(candidate, this.config.verifier)) {
      this.config.failedAttempts = (this.config.failedAttempts || 0) + 1;
      const delay = this.config.failedAttempts < 4 ? 0 : Math.min(15 * 60_000, 30_000 * (2 ** (this.config.failedAttempts - 4)));
      this.config.blockedUntil = now + delay;
      this.persist();
      throw new Error(delay ? `Неверный ключ. Новая попытка через ${Math.ceil(delay / 1000)} сек.` : 'Неверный код или графический ключ.');
    }
    this.config.failedAttempts = 0;
    this.config.blockedUntil = 0;
    this.persist();
    this.unlock();
    return true;
  }

  async remove(secret) {
    if (this.config && !await this.verifyWithoutUnlock(secret)) throw new Error('Текущий код или графический ключ неверен.');
    this.config = null;
    this.storage?.removeItem(STORAGE_KEY);
    this.unlock();
    this.notify?.('Блокировка приложения отключена на этом устройстве.');
    return true;
  }

  async verifyWithoutUnlock(secret) {
    const normalized = this.config.mode === 'pattern' ? normalizePattern(secret) : String(secret || '');
    const salt = Uint8Array.from(this.config.salt.match(/.{2}/g).map(part => parseInt(part, 16)));
    return safeEqual(await this.derive(`${this.config.mode}:${normalized}`, salt), this.config.verifier);
  }

  start() {
    if (this.bound) return;
    this.bound = true;
    this.document?.addEventListener?.('visibilitychange', this.visibilityHandler);
    const authState = this.client?.auth?.onAuthStateChange?.((event, session) => {
      if (event === 'SIGNED_IN' && session?.user && this.config) this.lockNow();
    });
    this.authSubscription = authState?.data?.subscription || null;
    if (this.config) {
      void this.client?.auth?.getSession?.().then(({ data: session }) => {
        if (session?.session?.user && this.config) this.lockNow();
      }).catch(() => {});
    }
  }

  onVisibilityChange() {
    if (!this.config) return;
    if (this.document?.hidden) { this.hiddenAt = Date.now(); return; }
    if (this.hiddenAt && this.config.autoLockMinutes > 0 && Date.now() - this.hiddenAt >= this.config.autoLockMinutes * 60_000) this.lockNow();
    this.hiddenAt = 0;
  }

  lockNow() {
    if (!this.config || this.overlay || !this.document?.body) return;
    this.pattern = '';
    const isPattern = this.config.mode === 'pattern';
    this.overlay = this.document.createElement('div');
    this.overlay.className = 'rim-device-lock-overlay';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.innerHTML = `<section class="rim-device-lock-card"><div class="rim-device-lock-mark">⚜</div><h2>RIM заблокирован</h2><p>${isPattern ? 'Нарисуйте графический ключ на сетке.' : 'Введите код-пароль приложения.'}</p>${isPattern ? `<div class="rim-device-lock-grid">${Array.from({length:9},(_,i)=>`<button type="button" data-lock-dot="${i+1}" aria-label="Точка ${i+1}">${i+1}</button>`).join('')}</div><div class="rim-device-lock-sequence" data-lock-sequence>Ключ не введён</div>` : `<input class="field" type="password" inputmode="numeric" autocomplete="off" maxlength="16" data-lock-pin placeholder="Код-пароль"/>`}<div class="rim-device-lock-error" data-lock-error aria-live="polite"></div><button class="primary-btn" type="button" data-lock-unlock>Разблокировать</button>${isPattern ? `<button class="action-btn" type="button" data-lock-clear>Очистить</button>` : ''}</section>`;
    this.overlay.addEventListener('click', event => {
      const dot = event.target?.closest?.('[data-lock-dot]');
      if (dot) {
        const value = String(dot.dataset.lockDot);
        if (!this.pattern.includes(value)) this.pattern += value;
        dot.classList.add('selected');
        const label = this.overlay.querySelector('[data-lock-sequence]');
        if (label) label.textContent = `Выбрано точек: ${this.pattern.length}`;
      }
      if (event.target?.closest?.('[data-lock-clear]')) {
        this.pattern = '';
        this.overlay.querySelectorAll('[data-lock-dot]').forEach(node => node.classList.remove('selected'));
        const label = this.overlay.querySelector('[data-lock-sequence]');
        if (label) label.textContent = 'Ключ не введён';
      }
      if (event.target?.closest?.('[data-lock-unlock]')) {
        const value = isPattern ? this.pattern : this.overlay.querySelector('[data-lock-pin]')?.value || '';
        void this.verify(value).catch(error => {
          const output = this.overlay?.querySelector('[data-lock-error]');
          if (output) output.textContent = error?.message || 'Не удалось разблокировать RIM.';
          this.pattern = '';
          this.overlay?.querySelectorAll('[data-lock-dot]')?.forEach(node => node.classList.remove('selected'));
          const pin = this.overlay?.querySelector('[data-lock-pin]');
          if (pin) { pin.value = ''; pin.focus(); }
        });
      }
    });
    this.document.body.append(this.overlay);
    this.overlay.querySelector('[data-lock-pin]')?.focus?.();
  }

  unlock() {
    this.overlay?.remove?.();
    this.overlay = null;
    this.pattern = '';
  }

  openSettings() {
    const html = `<h2 class="modal-title">Блокировка приложения</h2><div class="rim-device-lock-note"><b>Локальная защита экрана</b><p>Код или графический ключ скрывает RIM при открытии приложения и после выбранного периода в фоне. Это дополнительный барьер конфиденциальности на данном устройстве, а не замена паролю аккаунта: он не отзывает серверную сессию и не защищает от человека с доступом к профилю браузера или хранилищу устройства.</p></div><label class="field-label">Автоматически блокировать после отсутствия</label><select class="field" id="rimDeviceLockTimeout"><option value="0">Только при новом запуске</option><option value="1" selected>1 минута</option><option value="5">5 минут</option><option value="15">15 минут</option><option value="60">60 минут</option></select><h3>Код-пароль</h3><input class="field" id="rimDeviceLockPin" type="password" inputmode="numeric" autocomplete="new-password" placeholder="8–16 цифр"/><button class="primary-btn" style="width:100%;margin-top:7px" type="button" data-lock-save-pin>Установить код-пароль</button><h3 style="margin-top:18px">Графический ключ</h3><p class="muted">Нажмите минимум 6 разных точек по порядку.</p><div class="rim-device-lock-grid rim-device-lock-setup-grid">${Array.from({length:9},(_,i)=>`<button type="button" data-setup-dot="${i+1}">${i+1}</button>`).join('')}</div><div class="rim-device-lock-sequence" data-setup-sequence>Ключ не введён</div><button class="action-btn" type="button" data-setup-clear>Очистить рисунок</button><button class="primary-btn" style="width:100%;margin-top:7px" type="button" data-lock-save-pattern>Установить графический ключ</button>${this.config ? `<button class="action-btn" style="width:100%;margin-top:12px" type="button" data-lock-now>Заблокировать сейчас</button><label class="field-label" style="margin-top:12px">Текущий ключ для отключения</label><input class="field" id="rimDeviceLockCurrentSecret" type="password" inputmode="numeric" autocomplete="off" placeholder="${this.config.mode === 'pin' ? 'Текущий PIN' : 'Последовательность точек 1–9'}"/><button class="action-btn" style="width:100%;margin-top:8px" type="button" data-lock-remove>Отключить блокировку</button>` : ''}`;
    this.window?.showModal?.(html);
    const modal = this.document?.querySelector?.('#modalRoot .modal');
    let setupPattern = '';
    modal?.addEventListener?.('click', event => {
      const dot = event.target?.closest?.('[data-setup-dot]');
      if (dot && modal.contains(dot)) {
        const value = String(dot.dataset.setupDot);
        if (!setupPattern.includes(value)) setupPattern += value;
        dot.classList.add('selected');
        const label = modal.querySelector('[data-setup-sequence]');
        if (label) label.textContent = `Выбрано точек: ${setupPattern.length}`;
      }
      if (event.target?.closest?.('[data-setup-clear]')) {
        setupPattern = '';
        modal.querySelectorAll('[data-setup-dot]').forEach(node => node.classList.remove('selected'));
        const label = modal.querySelector('[data-setup-sequence]');
        if (label) label.textContent = 'Ключ не введён';
      }
      if (event.target?.closest?.('[data-lock-save-pin]')) {
        void this.configure('pin', modal.querySelector('#rimDeviceLockPin')?.value, modal.querySelector('#rimDeviceLockTimeout')?.value)
          .then(() => this.window?.closeModal?.()).catch(error => this.notify?.(error.message));
      }
      if (event.target?.closest?.('[data-lock-save-pattern]')) {
        void this.configure('pattern', setupPattern, modal.querySelector('#rimDeviceLockTimeout')?.value)
          .then(() => this.window?.closeModal?.()).catch(error => this.notify?.(error.message));
      }
      if (event.target?.closest?.('[data-lock-now]')) {
        this.window?.closeModal?.();
        this.lockNow();
      }
      if (event.target?.closest?.('[data-lock-remove]')) {
        if (!this.config) return;
        const currentSecret = modal.querySelector('#rimDeviceLockCurrentSecret')?.value || '';
        void this.remove(currentSecret).then(() => this.window?.closeModal?.()).catch(error => this.notify?.(error.message));
      }
    });
  }

  dispose() {
    this.authSubscription?.unsubscribe?.();
    this.document?.removeEventListener?.('visibilitychange', this.visibilityHandler);
    this.unlock();
    this.bound = false;
  }
}
