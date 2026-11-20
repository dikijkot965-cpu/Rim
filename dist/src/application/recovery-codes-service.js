import { createRecoveryPhrase, normalizeRecoveryPhrase, validateRecoveryPhrase } from '../domain/recovery-phrase.js';

/** Recovery credentials are one-time secrets: raw values are returned once and never persisted client-side. */
export class RecoveryCodesService {
  constructor({ client, cryptoRef = globalThis.crypto } = {}) { this.client = client; this.crypto = cryptoRef; }

  async #invoke(action, body = {}) {
    if (!this.client?.auth || !this.client?.functions?.invoke) throw new Error('Сервис безопасности аккаунта недоступен.');
    const { data: sessionData, error: sessionError } = await this.client.auth.getSession();
    if (sessionError || !sessionData?.session?.access_token) throw new Error('Для этой операции необходимо войти в RIM.');
    const { data, error } = await this.client.functions.invoke('rim-account-security', { body: { action, ...body } });
    if (error) throw error;
    if (data?.error) {
      const messages = {
        rate_limited: 'Слишком много попыток. Попробуйте позже.',
        seed_auth_hook_not_configured: 'Строгий режим ещё не активирован в Supabase Auth. Включение заблокировано, чтобы не потерять доступ.',
        seed_only_activation_pending_retry_required: 'Настройка находится в защищённом промежуточном состоянии. Не выходите из текущей сессии; повторите операцию или обратитесь к администратору.',
        phrase_does_not_match_account: 'Эта фраза не совпадает с активной фразой данного аккаунта.',
        weak_password: 'Новый пароль должен содержать не менее 12 символов.'
      };
      throw new Error(messages[data.error] || 'Операция безопасности не выполнена.');
    }
    return data;
  }

  async issue() {
    const data = await this.#invoke('issue');
    if (!Array.isArray(data?.codes) || data.codes.length !== 10) throw new Error('Сервер не вернул полный набор кодов восстановления.');
    return data.codes;
  }

  async createPhraseDraft(wordCount = 24) { return createRecoveryPhrase(this.crypto, wordCount); }

  async savePhrase(phrase) {
    const normalized = normalizeRecoveryPhrase(phrase);
    if (!await validateRecoveryPhrase(normalized, this.crypto)) throw new Error('Фраза не прошла локальную проверку. Создайте её заново.');
    await this.#invoke('save_phrase', { phrase: normalized });
    return true;
  }

  async issuePhrase() {
    const phrase = await this.createPhraseDraft();
    await this.savePhrase(phrase);
    return phrase;
  }

  async securityStatus() { return this.#invoke('status'); }
  async markOnboardingSeen() { return this.#invoke('mark_onboarding_seen'); }

  async seedLogin(value) {
    const phrase = normalizeRecoveryPhrase(value);
    if (!await validateRecoveryPhrase(phrase, this.crypto)) throw new Error('Фраза неверна. Проверьте количество слов и их порядок.');
    if (!this.client?.functions?.invoke || !this.client?.auth?.setSession) throw new Error('Вход по секретной фразе недоступен.');
    const { data, error } = await this.client.functions.invoke('rim-account-security', { body: { action: 'seed_login', phrase } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error === 'seed_auth_hook_not_configured'
      ? 'Строгий режим входа ещё не активирован на сервере.'
      : 'Фраза не принята или вход временно ограничен.');
    if (!data?.access_token || !data?.refresh_token) throw new Error('Сервер не выдал сессию входа.');
    const { data: sessionData, error: sessionError } = await this.client.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token
    });
    if (sessionError) throw sessionError;
    if (!sessionData?.user) throw new Error('Сессия не подтверждена.');
    return sessionData.user;
  }

  async enableSeedOnly(phrase) {
    const normalized = normalizeRecoveryPhrase(phrase);
    if (!await validateRecoveryPhrase(normalized, this.crypto)) throw new Error('Проверьте фразу: требуется 12 или 24 слова.');
    return this.#invoke('seed_only_enable', { phrase: normalized });
  }

  async disableSeedOnly(phrase, newPassword) {
    const normalized = normalizeRecoveryPhrase(phrase);
    if (!await validateRecoveryPhrase(normalized, this.crypto)) throw new Error('Проверьте фразу: требуется 12 или 24 слова.');
    if (String(newPassword || '').length < 12) throw new Error('Новый пароль должен содержать не менее 12 символов.');
    return this.#invoke('seed_only_disable', { phrase: normalized, new_password: String(newPassword) });
  }

  async redeem(code) {
    const normalized = String(code || '').trim();
    if (!/^[A-Fa-f0-9-]{20,64}$/.test(normalized)) throw new Error('Введите действительный код восстановления.');
    return this.#redeem('redeem', { code: normalized });
  }

  async redeemPhrase(value) {
    const phrase = normalizeRecoveryPhrase(value);
    if (!await validateRecoveryPhrase(phrase, this.crypto)) throw new Error('Фраза неверна или содержит ошибку. Проверьте 12 или 24 слова.');
    return this.#redeem('redeem_phrase', { phrase });
  }

  async #redeem(action, body) {
    if (!this.client?.functions?.invoke || !this.client?.auth?.verifyOtp) throw new Error('Сервис восстановления недоступен.');
    const { data, error } = await this.client.functions.invoke('rim-account-security', { body: { action, ...body } });
    if (error) throw error;
    if (!data?.token_hash) throw new Error('Данные восстановления не приняты. Возможно, секрет уже использован.');
    const { data: authData, error: authError } = await this.client.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
    if (authError) throw authError;
    if (!authData?.user || !authData?.session) throw new Error('Сервер не создал действующую сессию.');
    return authData.user;
  }
}
