/**
 * Pure rules for local / cloud music tracks.
 */
export const MUSIC_TITLE_MAX = 120;
export const MUSIC_FILE_MAX_BYTES = 20 * 1024 * 1024;
export const MUSIC_ALLOWED_PREFIX = 'audio/';

/**
 * @returns {{ ok: true, title: string } | { ok: false, error: string }}
 */
export function validateMusicTitle(raw) {
  const title = String(raw ?? '').trim();
  if (!title) return { ok: false, error: 'Укажи название трека.' };
  if (title.length > MUSIC_TITLE_MAX) {
    return { ok: false, error: `Название не длиннее ${MUSIC_TITLE_MAX} символов.` };
  }
  return { ok: true, title };
}

/**
 * @param {File|Blob|null|undefined} file
 * @returns {{ ok: true, file: File|Blob } | { ok: false, error: string }}
 */
export function validateMusicFile(file) {
  if (!file) return { ok: false, error: 'Выбери аудиофайл.' };
  const type = String(file.type || '');
  if (type && !type.startsWith(MUSIC_ALLOWED_PREFIX) && !/\.(mp3|m4a|ogg|wav|flac|aac)$/i.test(file.name || '')) {
    return { ok: false, error: 'Нужен аудиофайл (mp3, m4a, ogg, wav…).' };
  }
  if (typeof file.size === 'number' && file.size > MUSIC_FILE_MAX_BYTES) {
    return { ok: false, error: 'Максимальный размер файла — 20 МБ.' };
  }
  return { ok: true, file };
}

export function validateMusicUpload(titleRaw, file) {
  const title = validateMusicTitle(titleRaw);
  if (!title.ok) return title;
  const audio = validateMusicFile(file);
  if (!audio.ok) return audio;
  return { ok: true, title: title.title, file: audio.file };
}
