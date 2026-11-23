import { escapeHtml } from '../core/html.js';
/**
 * Composition: message timeline pagination + reply targets + loadMessages routes.
 */
import { MessageTimelineController } from '../application/message-timeline-controller.js';
import { ReplyTargetController } from '../application/reply-target-controller.js';
import { MessageSearchController } from '../application/message-search-controller.js';

/**
 * @param {object} deps
 */
export function bindMessageTimelineSurface({
  messageRepository,
  getActiveConversation,
  loadLocalMessages = null,
  getUser = null,
  getMessages,
  setMessages,
  setReplyTarget = () => {},
  notify,
  logger,
  container,
  lifecycle,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  pageSize = 50
} = {}) {
  const win = windowRef;
  const doc = documentRef;
  const messagesNode = doc.getElementById?.('messages');

  const historyButton = doc.createElement?.('button');
  if (historyButton) {
    historyButton.type = 'button';
    historyButton.className = 'action-btn rim-history-button';
    historyButton.textContent = 'Загрузить более ранние сообщения';
    historyButton.hidden = true;
  }

  const updateHistoryButton = () => {
    if (!historyButton) return;
    historyButton.hidden = !timeline.hasOlder;
    historyButton.disabled = timeline.loadingOlder;
    historyButton.textContent = timeline.loadingOlder
      ? 'Загрузка…'
      : 'Загрузить более ранние сообщения';
  };

  const timeline = new MessageTimelineController({
    repository: messageRepository,
    getConversation: getActiveConversation,
    getMessages,
    setMessages,
    render: async () => {
      await win.renderMessages?.();
      updateHistoryButton();
    },
    logger,
    pageSize,
    loadLocalMessages,
    getUser
  });
  container?.value?.('timeline', timeline);

  if (historyButton) {
    historyButton.addEventListener('click', async () => {
      historyButton.disabled = true;
      historyButton.textContent = 'Загрузка…';
      try {
        await timeline.loadOlder();
      } catch (error) {
        logger?.warn?.('messages.history.load.failed', { message: error?.message });
        notify?.(`Не удалось загрузить историю: ${error?.message || error}`);
      } finally {
        updateHistoryButton();
      }
    });
    if (messagesNode?.parentNode) {
      messagesNode.parentNode.insertBefore(historyButton, messagesNode);
    }
  }

  const messageSearch = new MessageSearchController({
    repository: messageRepository,
    getConversation: getActiveConversation,
    timeline,
    documentRef,
    windowRef: win,
    logger
  });
  win.rimSearchInConversation = () => messageSearch.open();
  lifecycle?.add?.(() => { delete win.rimSearchInConversation; messageSearch.dispose(); });
  container?.value?.('messageSearch', messageSearch);

  const replyTargets = new ReplyTargetController({
    getMessages,
    setReplyTarget,
    logger
  });
  container?.value?.('replyTargets', replyTargets);
  win.setReply = id => replyTargets.setReply(id);
  win.cancelReply = () => replyTargets.cancel();
  lifecycle?.add?.(() => replyTargets.dispose());

  const loadActiveTimeline = async () => {
    const conversation = getActiveConversation?.();
    if (!conversation?.id) return [];
    if (messagesNode) messagesNode.innerHTML = '<div class="rim-msg-loading">Открываем переписку…</div>';
    try {
      return await timeline.loadLatest();
    } catch (error) {
      logger?.error?.('messages.latest.load.failed', error, { conversationId: conversation.id });
      if (messagesNode) {
        messagesNode.innerHTML = `<div class="notice">Не удалось загрузить сообщения: ${escapeHtml(error?.message || error)}</div>`;
      }
      throw error;
    }
  };

  const loadAndMarkActiveTimeline = async () => {
    const rows = await loadActiveTimeline();
    await win.markConversationRead?.();
    return rows;
  };

  win.__RIM_MESSAGE_TIMELINE_OWNED = true;
  win.rimLoadMessagesStable = loadAndMarkActiveTimeline;
  win.loadMessages = loadAndMarkActiveTimeline;
  const onE2EMessage = event => {
    const message = event?.detail?.message;
    const conversationId = message?.conversationId || message?.conversation_id;
    if (!conversationId || String(getActiveConversation?.()?.id) !== String(conversationId)) return;
    timeline.refreshLocalMessages(conversationId).catch(error => logger?.warn?.('e2e.timeline.refresh.failed', { message: error?.message || String(error) }));
  };
  win.addEventListener?.('rim:e2e-message', onE2EMessage);
  win.subscribeToMessages = () => timeline.subscribe();
  lifecycle?.add?.(() => {
    win.__RIM_MESSAGE_TIMELINE_OWNED = false;
    win.removeEventListener?.('rim:e2e-message', onE2EMessage);
    timeline.unsubscribe();
  });

  logger?.info?.('composition.messageTimelineSurface.bound', {});
  return {
    timeline,
    replyTargets,
    loadActiveTimeline,
    loadAndMarkActiveTimeline,
    updateHistoryButton,
    historyButton
  };
}
