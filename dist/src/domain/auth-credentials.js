/**
 * Pure auth credential rules for login / registration forms.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

/**
 * @returns {{ ok: true, email: string } | { ok: false, error: string }}
 */
export function validateEmail(raw) {
  const email = normalizeEmail(raw);
  if (!email) return { ok: false, error: 'Введите адрес электронной почты.' };
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Введите действующий адрес электронной почты.' };
  return { ok: true, email };
}

/**
 * @returns {{ ok: true, password: string } | { ok: false, error: string }}
 */
export function validatePasswordForLogin(raw) {
  const password = String(raw ?? '');
  if (!password) return { ok: false, error: 'Введите пароль.' };
  return { ok: true, password };
}

/**
 * Registration: min 8 chars + optional confirm match.
 * @returns {{ ok: true, password: string } | { ok: false, error: string }}
 */
export function validatePasswordForRegistration(raw, confirmRaw = '') {
  const password = String(raw ?? '');
  const confirm = String(confirmRaw ?? '');
  if (password.length < 8) {
    return { ok: false, error: 'Пароль должен быть не короче 8 символов.' };
  }
  if (confirm && confirm !== password) {
    return { ok: false, error: 'Пароли не совпадают.' };
  }
  return { ok: true, password };
}

/**
 * Combined login payload validation.
 */
export function validateLoginCredentials(emailRaw, passwordRaw) {
  const email = validateEmail(emailRaw);
  if (!email.ok) return email;
  const password = validatePasswordForLogin(passwordRaw);
  if (!password.ok) return password;
  return { ok: true, email: email.email, password: password.password };
}

/**
 * Combined registration payload validation.
 */
export function validateRegistrationCredentials(emailRaw, passwordRaw, confirmRaw) {
  const email = validateEmail(emailRaw);
  if (!email.ok) return email;
  const password = validatePasswordForRegistration(passwordRaw, confirmRaw);
  if (!password.ok) return password;
  return { ok: true, email: email.email, password: password.password };
}
