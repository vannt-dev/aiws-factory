const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes text for safe insertion into HTML. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ENTITIES[ch]);
}
