/**
 * Paints direct-chat header title, online status and avatar after open.
 * Sequence-aware: callers pass isCurrent() to drop stale navigations.
 */
export async function paintDirectPeerHeader({
  conversation,
  user,
  repository,
  resolveChatHeader,
  applyPeerAvatar,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  isCurrent = () => true,
  sequence = 0,
  logger = null
} = {}) {
  if (!conversation || conversation.type !== 'direct') return null;
  if (!isCurrent()) return null;

  const cachedPeer = conversation.other_profile || conversation.peer_profile || null;
  const cachedTitle = cachedPeer?.display_name?.trim()
    || cachedPeer?.username?.trim()
    || conversation.title
    || 'Личные сообщения';

  const titleNode = documentRef.getElementById?.('chatHeadName');
  if (titleNode) titleNode.textContent = cachedTitle;
  const avatarNode = documentRef.getElementById?.('chatHeadAvatar');
  const cachedAvatarTask = applyPeerAvatar
    ? applyPeerAvatar(avatarNode, cachedPeer, cachedTitle, sequence)
    : Promise.resolve(null);

  const resolved = await resolveChatHeader({
    conversation,
    user,
    repository,
    logger
  });

  if (!isCurrent()) return null;
  if (titleNode) {
    titleNode.textContent = resolved.title;
    const username = resolved.peer?.username;
    titleNode.onclick = username ? () => windowRef?.findUserByName?.(username) : null;
    if (titleNode.style) titleNode.style.cursor = username ? 'pointer' : '';
    titleNode.setAttribute?.('role', username ? 'button' : 'heading');
    titleNode.setAttribute?.('tabindex', username ? '0' : '-1');
    titleNode.setAttribute?.('aria-label', username ? 'Открыть профиль @' + username : resolved.title);
    if (username && !titleNode.dataset.rimProfileKeydown) {
      titleNode.dataset.rimProfileKeydown = '1';
      titleNode.addEventListener('keydown', event => {
        if ((event.key === 'Enter' || event.key === ' ') && typeof titleNode.onclick === 'function') {
          event.preventDefault(); titleNode.onclick();
        }
      });
    }
  }

  const status = documentRef.getElementById?.('chatHeadStatus');
  const seenAt = resolved.peer?.last_seen_at ? new Date(resolved.peer.last_seen_at) : null;
  const visible = resolved.peer?.showOnline === true || resolved.peer?.show_online === true;
  const validSeen = seenAt && Number.isFinite(seenAt.getTime()) && seenAt.getTime() <= Date.now();
  const online = visible && validSeen && (Date.now() - seenAt.getTime() < 120000);
  if (status) {
    status.textContent = !visible
      ? 'Статус скрыт'
      : (online
        ? 'В сети'
        : (validSeen
          ? `Был(а) в сети ${seenAt.toLocaleString('ru-RU')}`
          : 'Время посещения неизвестно'));
  }

  if (applyPeerAvatar) {
    await Promise.all([
      cachedAvatarTask,
      applyPeerAvatar(avatarNode, resolved.peer, resolved.title, sequence)
    ]);
  }

  return resolved;
}
