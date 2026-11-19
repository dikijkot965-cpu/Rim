/**
 * Pure channel rules — no DOM, no Supabase.
 */

export function normalizeChannelTitle(value) {
  const title = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!title) return { ok: false, error: 'Укажите название канала.' };
  if (title.length < 2) return { ok: false, error: 'Название канала слишком короткое.' };
  if (title.length > 80) return { ok: false, error: 'Название канала не длиннее 80 символов.' };
  return { ok: true, value: title };
}

export function normalizeChannelHandle(value) {
  const raw = String(value ?? '').trim().replace(/^@+/, '').toLowerCase();
  if (!raw) return { ok: false, error: 'Укажите адрес канала.' };
  if (!/^[a-z0-9_]{3,32}$/.test(raw)) {
    return { ok: false, error: 'Адрес: 3–32 символа, латиница, цифры и _.' };
  }
  return { ok: true, value: raw };
}

export function normalizeChannelPostBody(value) {
  const body = String(value ?? '').trim();
  if (!body) return { ok: false, error: 'Пустой пост.' };
  if (body.length > 8000) return { ok: false, error: 'Пост слишком длинный.' };
  return { ok: true, value: body };
}

export function canPublishToChannel({ role, isOwner = false } = {}) {
  const r = String(role || '').toLowerCase();
  if (isOwner) return true;
  return r === 'owner' || r === 'admin' || r === 'editor' || r === 'moderator';
}
