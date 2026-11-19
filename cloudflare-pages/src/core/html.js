/**
 * Canonical HTML escaping for RIM UI surfaces.
 * All user-controlled strings interpolated into HTML must pass through these helpers.
 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[ch]);
}

export function escapeAttr(value) {
  // Attribute context: same as HTML entity escape for quotes and tags.
  return escapeHtml(value);
}

export function escapeJsString(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/</g, '\\u003c');
}
