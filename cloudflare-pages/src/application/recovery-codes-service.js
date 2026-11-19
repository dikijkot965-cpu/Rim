/**
 * One-time recovery credentials backed by the private rim-account-security Edge Function.
 * Raw codes are displayed only once and are never persisted in browser storage.
 */
export class RecoveryCodesService {
  constructor({ client } = {}) { this.client = client; }

  async issue() {
    if (!this.client?.auth || !this.client?.functions?.invoke) throw new Error('Сервис кодов восстановления недоступен.');
    const { data: sessionData, error: sessionError } = await this.client.auth.getSession();
    if (sessionError || !sessionData?.session?.access_token) throw new Error('Для выпуска кодов необходимо войти в RIM.');
    const { data, error } = await this.client.functions.invoke('rim-account-security', { body: { action: 'issue' } });
    if (error) throw error;
    if (!Array.isArray(data?.codes) || data.codes.length !== 10) throw new Error('Сервер не вернул полный набор кодов восстановления.');
    return data.codes;
  }

  async redeem(code) {
    const normalized = String(code || '').trim();
    if (!/^[A-Fa-f0-9-]{20,64}$/.test(normalized)) throw new Error('Введите действительный код восстановления.');
    if (!this.client?.functions?.invoke || !this.client?.auth?.verifyOtp) throw new Error('Сервис восстановления недоступен.');
    const { data, error } = await this.client.functions.invoke('rim-account-security', { body: { action: 'redeem', code: normalized } });
    if (error) throw error;
    if (!data?.token_hash) throw new Error('Код не принят. Возможно, он уже использован.');
    const { data: authData, error: authError } = await this.client.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
    if (authError) throw authError;
    if (!authData?.user || !authData?.session) throw new Error('Сервер не создал действующую сессию.');
    return authData.user;
  }
}
