/**
 * Pure conversation domain helpers — no DOM, no network.
 */

export const isDirectConversation = conversation => conversation?.type === 'direct';

export const isGroupConversation = conversation => conversation?.type === 'group';

export const displayConversationTitle = (conversation, peer) => {
  if (isDirectConversation(conversation)) {
    return peer?.display_name?.trim()
      || peer?.username?.trim()
      || conversation?.title?.trim()
      || conversation?.other_profile?.display_name?.trim()
      || conversation?.peer_profile?.display_name?.trim()
      || 'Личные сообщения';
  }
  return conversation?.title?.trim() || 'Групповая беседа';
};

export function conversationActivityTime(conversation) {
  const raw = conversation?._rimLastMessageAt
    || conversation?.last_message_at
    || conversation?.updated_at
    || conversation?.created_at;
  const value = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(value) ? value : 0;
}

/**
 * Stable sort for conversation list: last activity desc, then id.
 */
export function compareConversationsByActivity(a, b) {
  const delta = conversationActivityTime(b) - conversationActivityTime(a);
  if (delta) return delta;
  return String(b?.id ?? '').localeCompare(String(a?.id ?? ''));
}

export function sortConversationsByActivity(list) {
  return [...(list || [])].sort(compareConversationsByActivity);
}

/**
 * Filter by search query against title and optional peer labels.
 */
export function filterConversations(list, query, peerTitleById = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return list || [];
  return (list || []).filter(chat => {
    const title = String(
      chat?.title
      || peerTitleById[chat?.id]
      || chat?.other_profile?.display_name
      || chat?.peer_profile?.display_name
      || ''
    ).toLowerCase();
    const type = String(chat?.type || '').toLowerCase();
    const preview = String(chat?._rimLastMessagePreview || '').toLowerCase();
    return title.includes(q) || type.includes(q) || preview.includes(q);
  });
}

export function conversationSubtitle(conversation) {
  if (conversation?._rimLastMessagePreview) return String(conversation._rimLastMessagePreview).slice(0, 100);
  if (isDirectConversation(conversation)) return 'Личные сообщения';
  if (isGroupConversation(conversation)) return 'Групповая беседа';
  if (conversation?.type === 'channel') return conversation?.username ? '@' + conversation.username : 'Канал';
  return '';
}

export function messagePreview(message) {
  const body = String(message?.body || '').replace(/\s+/g, ' ').trim();
  if (body) return body.slice(0, 100);
  if (message?.image_path) return 'Фото';
  if (message?.attachment_path) {
    return message.attachment_name ? `Файл: ${message.attachment_name}` : 'Вложение';
  }
  if (message?.sticker_id) return 'Стикер';
  return 'Новое сообщение';
}
