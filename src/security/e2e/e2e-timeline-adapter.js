/**
 * Maps decrypted device-local E2E records into the existing RIM timeline shape.
 * These rows are deliberately tagged local-only: they must never be passed to
 * chat_messages mutations, receipts, or server-side message actions.
 */
export function toRimE2ETimelineMessage(message, currentUserId) {
  const id = String(message?.messageId || '');
  const conversationId = String(message?.conversationId || '');
  if (!id || !conversationId) return null;
  const senderId = String(message.senderId || '');
  const timestamp = Number(message.timestamp || Date.now());
  const date = new Date(Number.isFinite(timestamp) ? timestamp : Date.now());
  return {
    id,
    conversation_id: conversationId,
    sender_id: senderId,
    body: String(message.body ?? ''),
    created_at: date.toISOString(),
    reply_to_message_id: message.replyTo ? String(message.replyTo) : null,
    _rimE2E: true,
    _rimLocalOnly: true,
    _rimEncrypted: true,
    _rimE2EDirection: String(currentUserId || '') === senderId ? 'outgoing' : 'incoming',
  };
}

export function mergeRimE2ETimelineMessages(serverRows = [], localRows = [], currentUserId = '') {
  const byId = new Map();
  for (const row of Array.isArray(serverRows) ? serverRows : []) {
    if (row?.id != null) byId.set(String(row.id), row);
  }
  for (const raw of Array.isArray(localRows) ? localRows : []) {
    const row = toRimE2ETimelineMessage(raw, currentUserId);
    if (!row) continue;
    const existing = byId.get(String(row.id));
    // A local encrypted record wins over a same-ID server record. This is
    // defensive: correctly encrypted RIM messages should not have a plaintext
    // chat_messages row at all.
    byId.set(String(row.id), existing?._rimLocalOnly ? { ...existing, ...row } : row);
  }
  return [...byId.values()].sort((a, b) => {
    const delta = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    return delta || String(a.id).localeCompare(String(b.id));
  });
}
