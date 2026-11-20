/**
 * Username rules for search, invites, and profile handles.
 */
const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

export function normalizeUsername(raw) {
  return String(raw ?? '').trim().replace(/^@+/, '').toLowerCase();
}

/**
 * @returns {{ ok: true, username: string } | { ok: false, error: string }}
 */
export function validateUsername(raw) {
  const username = normalizeUsername(raw);
  if (!username) return { ok: false, error: 'Укажите username.' };
  if (!USERNAME_RE.test(username)) {
    return { ok: false, error: 'Username: 3–24 символа, латиница, цифры, _.' };
  }
  return { ok: true, username };
}
