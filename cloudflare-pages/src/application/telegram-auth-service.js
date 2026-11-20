const STORAGE_KEY = 'rim.telegram.oidc.v1';
const TELEGRAM_CLIENT_ID = '9041438103';
const AUTHORIZATION_ENDPOINT = 'https://oauth.telegram.org/auth';
const EDGE_FUNCTION = 'telegram-auth';

/** Canonical production URL (GitHub Pages). Must match Telegram Bot OIDC redirect + Supabase secret TELEGRAM_REDIRECT_URI. */
export const RIM_PUBLIC_APP_URL = 'https://dikijkot965-cpu.github.io/Rim/';

function normalizeAppUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    let path = url.pathname || '/';
    if (!path.endsWith('/') && !/\.html?$/i.test(path)) path += '/';
    return `${url.origin}${path}`;
  } catch {
    return '';
  }
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomToken(cryptoRef, size = 32) {
  const bytes = new Uint8Array(size);
  cryptoRef.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256Base64Url(value, cryptoRef) {
  const digest = await cryptoRef.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

export class TelegramAuthService {
  constructor({ client, windowRef = globalThis.window, fetchRef = globalThis.fetch, clientId = TELEGRAM_CLIENT_ID, publicAppUrl = null } = {}) {
    this.client = client;
    this.window = windowRef;
    this.fetch = fetchRef;
    this.clientId = String(clientId);
    this.publicAppUrl = publicAppUrl;
    this.processing = false;
  }

  #redirectUri() {
    const override = normalizeAppUrl(this.publicAppUrl || this.window?.__RIM_PUBLIC_APP_URL);
    if (override) return override;

    try {
      const meta = this.window?.document?.querySelector?.('meta[name="rim-public-url"]')?.getAttribute?.('content');
      const fromMeta = normalizeAppUrl(meta);
      if (fromMeta) return fromMeta;
    } catch { /* ignore */ }

    try {
      const host = String(this.window?.location?.hostname || '');
      if (host === 'dikijkot965-cpu.github.io' || host.endsWith('.github.io')) {
        return normalizeAppUrl(RIM_PUBLIC_APP_URL);
      }
    } catch { /* ignore */ }

    const location = this.window?.location;
    if (!location?.origin) throw new Error('Не удалось определить адрес возврата Telegram.');
    const path = location.pathname && location.pathname !== '/' ? location.pathname : '/';
    return normalizeAppUrl(`${location.origin}${path}`) || `${location.origin}/`;
  }

  #storage() {
    const storage = this.window?.sessionStorage;
    if (!storage?.getItem || !storage?.setItem) throw new Error('Для безопасного входа через Telegram требуется sessionStorage.');
    return storage;
  }

  async start() {
    if (!this.client?.auth || !this.fetch) throw new Error('Сервис авторизации не готов.');
    const cryptoRef = this.window?.crypto || globalThis.crypto;
    if (!cryptoRef?.subtle || !cryptoRef?.getRandomValues) throw new Error('Браузер не поддерживает безопасную криптографию. Откройте RIM по HTTPS.');

    const state = randomToken(cryptoRef);
    const nonce = randomToken(cryptoRef);
    const verifier = randomToken(cryptoRef, 48);
    const challenge = await sha256Base64Url(verifier, cryptoRef);
    const redirectUri = this.#redirectUri();
    this.#storage().setItem(STORAGE_KEY, JSON.stringify({ state, nonce, verifier, redirectUri, createdAt: Date.now() }));

    const url = new URL(AUTHORIZATION_ENDPOINT);
    url.search = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile',
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    }).toString();
    this.window.location.assign(url.toString());
    return { ok: true };
  }

  async handleCallback() {
    const url = new URL(this.window.location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const providerError = url.searchParams.get('error');
    if (!code && !state && !providerError) return { handled: false };
    if (this.processing) return { handled: true, ok: false };
    this.processing = true;

    const cleanUrl = new URL(this.#redirectUri());
    for (const [key, value] of url.searchParams.entries()) {
      if (!['code', 'state', 'error', 'error_description', 'scope'].includes(key)) cleanUrl.searchParams.append(key, value);
    }
    this.window.history?.replaceState?.({}, '', cleanUrl.toString());

    try {
      if (providerError) throw new Error('Вход через Telegram отменён или отклонён.');
      const raw = this.#storage().getItem(STORAGE_KEY);
      this.#storage().removeItem(STORAGE_KEY);
      if (!raw) throw new Error('Сессия входа Telegram не найдена. Начните вход заново.');
      const pending = JSON.parse(raw);
      if (!state || state !== pending.state) throw new Error('Проверка state не пройдена. Возможна подмена запроса.');
      if (!pending.createdAt || Date.now() - pending.createdAt > 10 * 60 * 1000) throw new Error('Запрос входа Telegram устарел. Начните заново.');
      if (pending.redirectUri !== this.#redirectUri()) throw new Error('Адрес возврата изменился. Начните вход заново.');

      const supabaseUrl = String(this.client.supabaseUrl || '').replace(/\/$/, '');
      const publishableKey = this.client.rest?.headers?.apikey || this.client.headers?.apikey || this.window.RIM_SUPABASE_PUBLISHABLE_KEY;
      if (!supabaseUrl || !publishableKey) throw new Error('Не найдена конфигурация Supabase для Telegram Auth.');

      const response = await this.fetch(`${supabaseUrl}/functions/v1/${EDGE_FUNCTION}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: publishableKey },
        body: JSON.stringify({
          code,
          code_verifier: pending.verifier,
          nonce: pending.nonce,
          redirect_uri: pending.redirectUri
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.token_hash) {
        throw new Error(payload.message || payload.error_description || 'Не удалось подтвердить аккаунт Telegram.');
      }

      const { data, error } = await this.client.auth.verifyOtp({ token_hash: payload.token_hash, type: 'magiclink' });
      if (error) throw error;
      if (!data?.user || !data?.session) throw new Error('Supabase не выдал действующую сессию.');
      return { handled: true, ok: true, user: data.user };
    } catch (error) {
      return { handled: true, ok: false, error };
    } finally {
      this.processing = false;
    }
  }
}

export const TELEGRAM_AUTH_STORAGE_KEY = STORAGE_KEY;
