import {
  validateLoginCredentials,
  validateRegistrationCredentials,
  validateEmail
} from '../domain/auth-credentials.js';
import { Err, Ok } from '../core/result.js';
import { TelegramAuthService } from './telegram-auth-service.js';
import { RecoveryCodesService } from './recovery-codes-service.js';

function withTimeout(promise, milliseconds, message) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })
  ]).finally(() => { if (timer !== undefined) clearTimeout(timer); });
}

/**
 * Owns auth form UX transitions + credential validation.
 * Network calls stay in the injected client (Supabase auth).
 */
export class AuthFormController {
  constructor({
    client,
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    onSignedIn = async () => {},
    logger = null
  } = {}) {
    this.client = client;
    this.document = documentRef;
    this.window = windowRef;
    this.onSignedIn = onSignedIn;
    this.logger = logger;
    this.mode = 'login';
    this.busy = false;
    this.telegramAuth = new TelegramAuthService({ client, windowRef });
    this.recoveryCodes = new RecoveryCodesService({ client });
  }

  #el(id) {
    return this.document.getElementById?.(id) || null;
  }

  #setStatus(text) {
    const status = this.#el('authStatus');
    if (status) status.textContent = text || '';
  }

  showLoginForm() {
    this.mode = 'login';
    const extra = this.#el('signupExtras');
    if (extra) extra.hidden = true;
    const reg = this.#el('registerBtn');
    const login = this.#el('loginBtn');
    const pass = this.#el('authPassword');
    if (reg) {
      reg.textContent = 'Регистрация';
      reg.onclick = () => this.startRegistration();
    }
    if (login) {
      login.textContent = 'Войти';
      login.onclick = () => { this.signIn(); };
    }
    if (pass) {
      pass.autocomplete = 'current-password';
      pass.placeholder = 'Введите пароль';
    }
    const label = this.#el('passwordLabel');
    if (label) label.textContent = 'Пароль для входа';
    const confirm = this.#el('authPasswordConfirm');
    if (confirm) confirm.value = '';
    this.#setStatus('');
  }

  startRegistration() {
    this.mode = 'signup';
    const extra = this.#el('signupExtras');
    if (extra) extra.hidden = false;
    const reg = this.#el('registerBtn');
    const login = this.#el('loginBtn');
    const pass = this.#el('authPassword');
    if (reg) {
      reg.textContent = 'Создать аккаунт';
      reg.onclick = () => { this.signUp(); };
    }
    if (login) {
      login.textContent = 'Назад ко входу';
      login.onclick = () => this.showLoginForm();
    }
    if (pass) pass.autocomplete = 'new-password';
    const label = this.#el('passwordLabel');
    if (label) label.textContent = 'Придумайте пароль для входа';
    this.#setStatus('Укажите почту, придумайте пароль и повторите его.');
    this.#el('authPasswordConfirm')?.focus?.();
  }

  togglePassword(id, button) {
    const input = this.#el(id);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    if (button) button.textContent = input.type === 'password' ? 'Показать' : 'Скрыть';
  }

  async signIn() {
    if (this.busy) return Err(new Error('busy'));
    if (!this.client?.auth) {
      this.#setStatus('Сервис входа пока не загрузился. Обновите страницу.');
      return Err(new Error('no client'));
    }
    const parsed = validateLoginCredentials(
      this.#el('authEmail')?.value,
      this.#el('authPassword')?.value
    );
    if (!parsed.ok) {
      this.#setStatus(parsed.error);
      return Err(new Error(parsed.error));
    }

    this.busy = true;
    const button = this.#el('loginBtn');
    if (button) button.disabled = true;
    this.#setStatus('Проверяем данные…');
    try {
      const { data, error } = await withTimeout(
        this.client.auth.signInWithPassword({ email: parsed.email, password: parsed.password }),
        15000,
        'Сервер авторизации не ответил за 15 секунд. Проверьте соединение и повторите попытку.'
      );
      if (error) {
        const message = error.message || '';
        if (/invalid login credentials/i.test(message)) {
          this.#setStatus('Почта или пароль неверны. Проверьте данные и попробуйте ещё раз.');
        } else if (/email not confirmed/i.test(message)) {
          this.#setStatus('Сначала подтвердите адрес электронной почты по ссылке из письма.');
        } else {
          this.#setStatus(message || 'Не удалось выполнить вход.');
        }
        return Err(error);
      }
      if (!data?.user) throw new Error('Supabase не вернул пользователя после входа.');
      this.window.__RIM_LEGACY_CONTEXT?.setUser?.(data.user);
      this.window.currentUser = data.user;
      try {
        await withTimeout(
          this.onSignedIn(data.user),
          20000,
          'Вход выполнен, но загрузка RIM занимает слишком много времени. Обновите страницу.'
        );
      } catch (bootstrapError) {
        this.logger?.warn?.('auth.post_login_bootstrap.slow_or_failed', { message: bootstrapError?.message });
        this.#setStatus('Вход выполнен. RIM продолжает загружать данные; при необходимости обновите страницу.');
        return Ok(data.user);
      }
      this.#setStatus('Вход выполнен. Добро пожаловать в РИМ.');
      return Ok(data.user);
    } catch (error) {
      this.logger?.warn?.('auth.email_sign_in.failed', { message: error?.message || String(error) });
      this.#setStatus(error?.message || 'Не удалось выполнить вход. Попробуйте ещё раз.');
      return Err(error);
    } finally {
      this.busy = false;
      if (button) button.disabled = false;
    }
  }

  async signUp() {
    if (this.busy) return Err(new Error('busy'));
    if (!this.client?.auth) {
      this.#setStatus('Сервис регистрации пока не загрузился.');
      return Err(new Error('no client'));
    }
    const parsed = validateRegistrationCredentials(
      this.#el('authEmail')?.value,
      this.#el('authPassword')?.value,
      this.#el('authPasswordConfirm')?.value
    );
    if (!parsed.ok) {
      this.#setStatus(parsed.error);
      return Err(new Error(parsed.error));
    }

    this.busy = true;
    const regBtn = this.#el('registerBtn');
    if (regBtn) regBtn.disabled = true;
    this.#setStatus('Создаём аккаунт...');
    try {
      const { data, error } = await this.client.auth.signUp({
        email: parsed.email,
        password: parsed.password
      });
      if (error) {
        this.#setStatus(error.message || String(error));
        return Err(error);
      }
      if (data.session) {
        this.window.__RIM_LEGACY_CONTEXT?.setUser?.(data.user);
      this.window.currentUser = data.user;
        await this.onSignedIn(data.user);
      } else {
        this.#setStatus('Регистрация создана. Проверь почту и подтверди адрес.');
        this.showLoginForm();
      }
      return Ok(data.user || null);
    } finally {
      this.busy = false;
      if (regBtn) regBtn.disabled = false;
    }
  }

  async resetPassword() {
    const parsed = validateEmail(this.#el('authEmail')?.value);
    if (!parsed.ok) {
      this.#setStatus(parsed.error.includes('действующий')
        ? 'Сначала укажите электронную почту, на которую зарегистрирован аккаунт.'
        : parsed.error);
      return Err(new Error(parsed.error));
    }
    try {
      const { error } = await this.client.auth.resetPasswordForEmail(parsed.email);
      if (error) throw error;
      this.#setStatus('Если аккаунт с таким адресом существует, письмо для восстановления отправлено.');
      return Ok(true);
    } catch (error) {
      this.#setStatus(error?.message || String(error));
      return Err(error);
    }
  }

  async signInWithSeedPhrase() {
    if (this.busy) return Err(new Error('busy'));
    const phrase = this.#el('rimSeedLoginPhrase')?.value || '';
    this.busy = true;
    const button = this.#el('rimSeedLoginSubmit');
    if (button) button.disabled = true;
    this.#setStatus('Проверяем секретную фразу и подготавливаем защищённую сессию…');
    try {
      const user = await this.recoveryCodes.seedLogin(phrase);
      this.window.__RIM_LEGACY_CONTEXT?.setUser?.(user);
      this.window.currentUser = user;
      const input = this.#el('rimSeedLoginPhrase');
      if (input) input.value = '';
      this.#setStatus('Вход по секретной фразе выполнен. Загружаем RIM…');
      await this.onSignedIn(user);
      return Ok(user);
    } catch (error) {
      this.#setStatus(error?.message || 'Не удалось войти по секретной фразе.');
      return Err(error);
    } finally {
      this.busy = false;
      if (button) button.disabled = false;
    }
  }

  async recoverWithPhrase() {
    if (this.busy) return Err(new Error('busy'));
    const phrase = this.#el('rimRecoveryPhrase')?.value || '';
    this.busy = true;
    const button = this.#el('rimRecoveryPhraseSubmit');
    if (button) button.disabled = true;
    this.#setStatus('Проверяем секретную фразу RIM…');
    try {
      const user = await this.recoveryCodes.redeemPhrase(phrase);
      this.window.__RIM_LEGACY_CONTEXT?.setUser?.(user);
      this.window.currentUser = user;
      this.#setStatus('Доступ восстановлен. Загружаем RIM…');
      await this.onSignedIn(user);
      return Ok(user);
    } catch (error) {
      this.#setStatus(error?.message || 'Не удалось восстановить доступ. Проверьте фразу.');
      return Err(error);
    } finally {
      this.busy = false;
      if (button) button.disabled = false;
    }
  }

  async recoverWithCode() {
    if (this.busy) return Err(new Error('busy'));
    const code = this.#el('rimRecoveryCode')?.value || '';
    this.busy = true;
    const button = this.#el('rimRecoverySubmit');
    if (button) button.disabled = true;
    this.#setStatus('Проверяем одноразовый код восстановления…');
    try {
      const user = await this.recoveryCodes.redeem(code);
      this.window.__RIM_LEGACY_CONTEXT?.setUser?.(user);
      this.window.currentUser = user;
      this.#setStatus('Доступ восстановлен. Загружаем RIM…');
      await this.onSignedIn(user);
      return Ok(user);
    } catch (error) {
      this.#setStatus(error?.message || 'Не удалось восстановить доступ. Проверьте код.');
      return Err(error);
    } finally {
      this.busy = false;
      if (button) button.disabled = false;
    }
  }

  async signInWithTelegram() {
    if (this.busy) return Err(new Error('busy'));
    this.busy = true;
    const button = this.#el('telegramAuthBtn');
    if (button) button.disabled = true;
    this.#setStatus('Подготавливаем защищённый вход через Telegram…');
    try {
      await this.telegramAuth.start();
      return Ok(true);
    } catch (error) {
      this.#setStatus(error?.message || 'Не удалось начать вход через Telegram.');
      return Err(error);
    } finally {
      this.busy = false;
      if (button) button.disabled = false;
    }
  }

  async handleTelegramCallback() {
    const result = await this.telegramAuth.handleCallback();
    if (!result.handled) return result;
    if (!result.ok) {
      this.#setStatus(result.error?.message || 'Вход через Telegram не выполнен.');
      return Err(result.error || new Error('Telegram sign-in failed'));
    }
    this.window.__RIM_LEGACY_CONTEXT?.setUser?.(result.user);
    this.window.currentUser = result.user;
    this.#setStatus('Вход через Telegram выполнен. Загружаем RIM…');
    try {
      await this.onSignedIn(result.user);
      this.#setStatus('Вы вошли через Telegram. РИМ готов к работе.');
      return Ok(result.user);
    } catch (error) {
      this.#setStatus(`Telegram подтвердил вход, но РИМ не смог загрузить данные: ${error?.message || error}`);
      return Err(error);
    }
  }

  signInWithGithub() {
    this.#setStatus('Вход через GitHub находится в разработке.');
    return Err(new Error('GitHub sign-in is not configured'));
  }

  signInWithVk() {
    this.#setStatus('Вход через VK находится в разработке.');
    return Err(new Error('VK sign-in is not configured'));
  }

  /**
   * OAuth Google via Supabase. Requires provider enabled in Supabase + Google Cloud client.
   * Same flow covers first-time registration and returning sign-in.
   */
  async signInWithGoogle() {
    if (this.busy) return Err(new Error('busy'));
    if (!this.client?.auth?.signInWithOAuth) {
      this.#setStatus('Сервис входа через Google пока не загрузился. Обновите страницу.');
      return Err(new Error('no client'));
    }
    this.busy = true;
    const btn = this.#el('googleAuthBtn');
    if (btn) btn.disabled = true;
    this.#setStatus('Перенаправление в Google…');
    try {
      const redirectTo = `${this.window.location.origin}${this.window.location.pathname || '/'}`;
      const { data, error } = await this.client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: { access_type: 'offline', prompt: 'consent' }
        }
      });
      if (error) {
        this.#setStatus(error.message || 'Не удалось начать вход через Google.');
        return Err(error);
      }
      // Browser navigates to data.url when using default redirect flow.
      if (data?.url) {
        this.window.location.href = data.url;
      }
      return Ok(data || true);
    } catch (error) {
      this.#setStatus(error?.message || String(error));
      return Err(error);
    } finally {
      this.busy = false;
      if (btn) btn.disabled = false;
    }
  }

  bindGlobals() {
    const win = this.window;
    win.__RIM_AUTH_FORM_OWNED = true;
    win.showLoginForm = () => this.showLoginForm();
    win.startRegistration = () => this.startRegistration();
    win.rimTogglePassword = (id, button) => this.togglePassword(id, button);
    win.rimResetPassword = () => this.resetPassword();
    win.rimRecoverWithCode = () => this.recoverWithCode();
    win.rimRecoverWithPhrase = () => this.recoverWithPhrase();
    win.rimSignInWithSeedPhrase = () => this.signInWithSeedPhrase();
    win.signIn = () => this.signIn();
    win.signUp = () => this.signUp();
    win.signInWithGoogle = () => this.signInWithGoogle();
    win.signInWithTelegram = () => this.signInWithTelegram();
    win.signInWithGithub = () => this.signInWithGithub();
    win.signInWithVk = () => this.signInWithVk();
    void this.handleTelegramCallback();
  }
}
