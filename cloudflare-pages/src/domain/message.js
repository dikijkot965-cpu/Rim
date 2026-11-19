/**
 * Pure message domain rules — no DOM, no Supabase.
 */
export const MESSAGE_BODY_MAX_LENGTH = 4000;
export const MESSAGE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const MESSAGE_IMAGE_EXTENSIONS = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
});

/**
 * @param {unknown} rawBody
 * @returns {{ ok: true, body: string } | { ok: false, error: string }}
 */
export function normalizeMessageBody(rawBody) {
  const body = String(rawBody ?? '').trim();
  if (!body) return { ok: false, error: 'Пустое сообщение нельзя отправить.' };
  if (body.length > MESSAGE_BODY_MAX_LENGTH) {
    return { ok: false, error: `Сообщение слишком длинное (макс. ${MESSAGE_BODY_MAX_LENGTH} символов).` };
  }
  return { ok: true, body };
}

/**
 * @param {File|Blob|null|undefined} file
 * @returns {{ ok: true, file: File|Blob, ext: string } | { ok: false, error: string }}
 */
export function validateImageAttachment(file) {
  if (!file) return { ok: false, error: 'Файл не выбран.' };
  const type = file.type || '';
  const ext = MESSAGE_IMAGE_EXTENSIONS[type];
  if (!ext) return { ok: false, error: 'Допустимы JPEG, PNG, WebP и GIF.' };
  if (typeof file.size === 'number' && file.size > MESSAGE_IMAGE_MAX_BYTES) {
    return { ok: false, error: 'Изображение больше 5 МБ.' };
  }
  return { ok: true, file, ext };
}

export function isOwnMessage(message, userId) {
  return Boolean(message && userId && String(message.sender_id) === String(userId));
}
