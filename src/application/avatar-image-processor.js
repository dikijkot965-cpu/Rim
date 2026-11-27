const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;

/** Validate and center-crop a profile image into a predictable 512px WebP avatar. */
export async function prepareAvatarImage(file, {
  documentRef = globalThis.document,
  createImageBitmapRef = globalThis.createImageBitmap,
  maxBytes = MAX_AVATAR_BYTES,
  outputSize = 512
} = {}) {
  if (!file) return null;
  if (!SUPPORTED_IMAGE_TYPES.has(String(file.type || '').toLowerCase())) throw new Error('Поддерживаются только JPG, PNG, WebP и GIF.');
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > maxBytes) throw new Error('Аватар должен быть размером от 1 байта до 3 МБ.');
  if (typeof createImageBitmapRef !== 'function' || typeof documentRef?.createElement !== 'function') return file;
  let bitmap;
  try {
    bitmap = await createImageBitmapRef(file);
    const width = Number(bitmap.width) || 0;
    const height = Number(bitmap.height) || 0;
    if (!width || !height) throw new Error('Не удалось прочитать изображение.');
    const side = Math.min(width, height);
    const canvas = documentRef.createElement('canvas');
    canvas.width = outputSize; canvas.height = outputSize;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Браузер не поддерживает обработку изображений.');
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, (width - side) / 2, (height - side) / 2, side, side, 0, 0, outputSize, outputSize);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.9));
    if (!blob) throw new Error('Не удалось подготовить аватар.');
    if (typeof globalThis.File === 'function') return new globalThis.File([blob], 'rim-avatar.webp', { type: 'image/webp', lastModified: Date.now() });
    return blob;
  } catch (error) { throw new Error(error?.message || 'Не удалось обработать аватар.'); }
  finally { try { bitmap?.close?.(); } catch { /* release is best effort */ } }
}
