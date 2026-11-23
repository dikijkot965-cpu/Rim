import { Container } from './core/container.js';
import { EventBus } from './core/event-bus.js';
import { Logger } from './core/logger.js';
import { HealthRegistry } from './core/health.js';
import { DisposableScope } from './core/disposable-scope.js';
import { ConversationRepository } from './infrastructure/supabase/conversation-repository.js';
import { MessageRepository } from './infrastructure/supabase/message-repository.js';
import { E2EScopeRepository } from './infrastructure/supabase/e2e-scope-repository.js';
import { RimSignalProtocolRuntime } from './security/e2e/signal-protocol-runtime.js';
import { SupabaseSignalProtocolRelay } from './security/e2e/supabase-signal-relay.js';
import { RimE2ELocalMessageStore } from './security/e2e/local-message-store.js';
import { bindE2ELiveLab } from './security/e2e/e2e-live-lab.js';
import { E2EDiagnosticsReporter } from './security/e2e/e2e-diagnostics-reporter.js';
import { resolveChatHeader } from './application/resolve-chat-header.js';
import { PeerAvatarService } from './application/peer-avatar-service.js';
import { bindChatAudience } from './composition/chat-audience.js';
import { bindSettingsSurface } from './composition/settings-surface.js';
import { bindChannelsSurface } from './composition/channels-surface.js';
import { BotPlatformController } from './application/bot-platform-controller.js';
import { ZladenBotService } from './application/zladen-bot-service.js';
import { ZladenSettingsController } from './application/zladen-settings-controller.js';
import { bindGroupsSurface } from './composition/groups-surface.js';
import { bindSocialSurface } from './composition/social-surface.js';
import { bindAdminSurface } from './composition/admin-surface.js';
import { bindShellSurface } from './composition/shell-surface.js';
import { bindMessageCommandsSurface } from './composition/message-commands-surface.js';
import { bindChatRuntimeSurface } from './composition/chat-runtime-surface.js';
import { bindMessageTimelineSurface } from './composition/message-timeline-surface.js';
import { bindConversationSessionSurface } from './composition/conversation-session-surface.js';
import { bindConversationOpenSurface } from './composition/conversation-open-surface.js';
import { bindFeaturesSurface } from './composition/features-surface.js';
import { bindLegacyEntrypointSurface } from './composition/legacy-entrypoint-surface.js';
import { ChannelRepository } from './infrastructure/supabase/channel-repository.js';
import { GroupRepository } from './infrastructure/supabase/group-repository.js';
import { ChannelFeedRepository } from './infrastructure/supabase/channel-feed-repository.js';
import { ChannelSettingsRepository } from './infrastructure/supabase/channel-settings-repository.js';
import { createLegacyBridge } from './compatibility/legacy-bridge.js';

// Compatibility baseline retained for static regression contracts: 4.1.8-iteration.163; package release is 4.1.8-iteration.174.
const context = window.__RIM_LEGACY_CONTEXT;
if (!context?.db) throw new Error('RIM bootstrap: legacy database client is unavailable');
const legacy = createLegacyBridge(context);
const container = new Container();
const logger = new Logger({ version: '4.1.8-iteration.174' });
const events = new EventBus();
const health = new HealthRegistry();
const lifecycle = new DisposableScope({ onError: error => logger.error('lifecycle.dispose.failed', error) });
container.value('db', legacy.db).value('logger', logger).value('events', events).value('health', health);
container.factory('conversationRepository', c => new ConversationRepository(c.get('db')));
container.factory('messageRepository', c => new MessageRepository(c.get('db'), { pageSize: 50 }));
// Protocol readiness is scope-specific; only a completed protected exchange for this exact scope can pass.
// Legacy global protocolReady: false remains the default in E2EScopeRepository unless a verified scope callback is supplied.
container.factory('e2eScopeRepository', c => new E2EScopeRepository(c.get('db'), { protocolReady: false, isScopeVerified: scope => e2eSignalRuntime.isScopeVerified(scope) }));
// Signal Protocol SDK and the RIM-owned Supabase relay are loaded on demand.
// Scopes remain protected-only until every participant passes an encrypted
// challenge/ack exchange and the active-device readiness RPC succeeds.
const e2eMessageStore = new RimE2ELocalMessageStore({ getUser: legacy.getUser });
const e2eDiagnostics = new E2EDiagnosticsReporter({ client: legacy.db, getUser: legacy.getUser, logger });
container.value('e2eDiagnostics', e2eDiagnostics);
const emitE2EMessage = (eventName, message) => {
  events.emit(eventName, message);
  try { window.dispatchEvent(new CustomEvent('rim:e2e-message', { detail: { eventName, message } })); } catch { /* non-browser test runtime */ }
};
const e2eSignalRuntime = new RimSignalProtocolRuntime({
  getUser: legacy.getUser,
  logger,
  messageStore: e2eMessageStore,
  diagnostics: e2eDiagnostics,
  relayFactory: ({ userId }) => new SupabaseSignalProtocolRelay({ client: legacy.db, userId, logger }),
  onDecryptedMessage: async (envelope, context = {}) => {
    const message = await e2eMessageStore.acceptIncoming(envelope, { expectedUserId: context.userId });
    if (message && String(legacy.getUser?.()?.id || '') === String(context.userId || '')) emitE2EMessage('received', message);
  },
  onOutgoingMessage: message => emitE2EMessage('sent', message),
  authorizePeerVerification: async ({ scopeType, conversationId, senderUserId, localUserId }) => {
    const scopeInput = scopeType === 'direct'
      ? { type: 'direct', id: conversationId, is_secret: true }
      : scopeType === 'group'
        ? { type: 'group', id: conversationId, is_private: true }
        : { type: 'private_channel', id: conversationId, is_public: false };
    const scope = await container.get('e2eScopeRepository').getScope(scopeInput, localUserId);
    if (!scope.ok || scope.value?.scope?.e2e_mode !== 'required') return false;
    if (scopeType === 'direct' && scope.value?.scope?.is_secret !== true) return false;
    if (scopeType === 'group' && scope.value?.scope?.is_private !== true) return false;
    if (scopeType === 'private_channel' && scope.value?.scope?.is_public !== false) return false;
    return Array.isArray(scope.value?.memberUserIds)
      && scope.value.memberUserIds.includes(String(senderUserId));
  }
});
container.value('e2eSignalRuntime', e2eSignalRuntime).value('e2eMessageStore', e2eMessageStore);
const startE2ERuntimeForProtectedConversation = async conversation => {
  const userId = String(legacy.getUser?.()?.id || '');
  if (!userId || !(conversation?.is_secret === true || conversation?.e2e_mode === 'required' || conversation?.e2e_mode === 'pending')) return;
  try { await e2eSignalRuntime.startIncoming(); }
  catch (error) { void e2eDiagnostics.record('runtime_start_failed', { status: 'error', code: error?.code || 'E2E_RUNTIME_START', conversationId: conversation.id, metadata: { errorName: error?.name || 'Error' } }); logger.warn('e2e.runtime.protected_scope_start.failed', { message: error?.message || String(error) }); }
};
const stopE2EConversationListener = events.on('conversation.opened', payload => {
  const conversation = payload?.conversation;
  const button = document.getElementById('rimE2EVerifyBtn');
  const visible = conversation?.type === 'direct' && (conversation?.is_secret === true || conversation?.e2e_mode === 'required')
    || conversation?.type === 'group' && conversation?.is_private === true;
  if (button) button.hidden = !visible;
  void startE2ERuntimeForProtectedConversation(conversation);
});
window.rimEnableE2EScope = async (scopeType, scopeId) => {
  const user = legacy.getUser?.();
  const type = String(scopeType || '');
  const id = String(scopeId || '');
  if (!user?.id || !id || !['group', 'private_channel'].includes(type)) { legacy.notify?.('E2E можно включить только для приватной группы или закрытого канала.'); return null; }
  const membershipTable = type === 'private_channel' ? 'channel_members' : 'conversation_members';
  const membershipKey = type === 'private_channel' ? 'channel_id' : 'conversation_id';
  try {
    const scopeInput = type === 'group' ? { type, id, is_private: true } : { type, id, is_public: false };
    const scopeRepository = container.get('e2eScopeRepository');
    const currentScope = await scopeRepository.getScope(scopeInput, user.id);
    if (!currentScope.ok) throw currentScope.error;
    if (currentScope.value.scope?.e2e_mode !== 'required' && currentScope.value.scope?.e2e_mode !== 'pending') {
      const pending = await scopeRepository.requestPending(scopeInput);
      if (!pending.ok) throw pending.error;
    }
    await e2eSignalRuntime.startIncoming();
    const members = await legacy.db.from(membershipTable).select('user_id').eq(membershipKey, id);
    if (members.error) throw members.error;
    const memberIds = [...new Set((members.data || []).map(row => String(row.user_id || '')).filter(Boolean))];
    if (!memberIds.includes(String(user.id)) || memberIds.length < 2) throw new Error('Не удалось подтвердить полный состав участников.');
    await e2eSignalRuntime.verifyScopeExchange({ type, id }, memberIds);
    if (currentScope.value.scope?.e2e_mode !== 'required') {
      const activated = await scopeRepository.activateScope(scopeInput);
      if (!activated.ok) throw activated.error;
    }
    const refreshed = await scopeRepository.getScope(scopeInput, user.id);
    if (!refreshed.ok) throw refreshed.error;
    const active = legacy.getActiveConversation?.();
    if (type === 'group' && active?.id === id) Object.assign(active, refreshed.value.scope);
    await window.renderMessages?.();
    legacy.notify?.('E2E включено. Все участники прошли проверку зашифрованного обмена; открытая отправка в этой переписке заблокирована.');
    return refreshed.value;
  } catch (error) {
    void e2eDiagnostics.record('peer_exchange_failed', { status: 'error', code: error?.code || 'E2E_SCOPE_ENABLE', conversationId: id, metadata: { scopeType: type, errorName: error?.name || 'Error' } });
    legacy.notify?.(error?.message || 'Не удалось включить E2E. Открытый текст не отправлялся.');
    return null;
  }
};
window.rimVerifyE2E = async () => {
  const conversation = legacy.getActiveConversation?.();
  const user = legacy.getUser?.();
  if (!user?.id || !conversation?.id) return null;
  if (conversation.type === 'group' && conversation.is_private === true) return window.rimEnableE2EScope('group', conversation.id);
  if (conversation.type !== 'direct' || !(conversation.is_secret === true || conversation.e2e_mode === 'required')) { legacy.notify?.('Проверка доступна в секретном чате или приватной группе.'); return null; }
  try {
    const scope = await container.get('e2eScopeRepository').getScope({ type: 'direct', id: conversation.id, is_secret: true }, user.id);
    if (!scope.ok) throw scope.error;
    if (!scope.value.peerUserId) throw new Error('Не найден второй участник секретного чата.');
    if (!Array.isArray(scope.value.memberUserIds) || scope.value.memberUserIds.length !== 2) throw new Error('Не удалось подтвердить полный состав участников секретного чата.');
    const result = await e2eSignalRuntime.verifyScopeExchange({ type: 'direct', id: conversation.id }, scope.value.memberUserIds);
    legacy.notify?.('Подтверждён зашифрованный обмен со всеми участниками секретного чата.');
    return result;
  } catch (error) {
    void e2eDiagnostics.record('peer_exchange_failed', { status: 'error', code: error?.code || 'E2E_PEER_VERIFY', conversationId: conversation.id, metadata: { errorName: error?.name || 'Error' } });
    legacy.notify?.(error?.message || 'Не удалось подтвердить E2E-обмен.');
    return null;
  }
};
lifecycle.add(() => { stopE2EConversationListener?.(); try { delete window.rimEnableE2EScope; delete window.rimVerifyE2E; } catch {} });
const disposeE2ELiveLab = bindE2ELiveLab({ client: legacy.db, getUser: legacy.getUser, getActiveConversation: legacy.getActiveConversation, runtime: e2eSignalRuntime, documentRef: document, windowRef: window });
lifecycle.add(() => { try { disposeE2ELiveLab(); } catch { /* optional diagnostic surface */ } });
// Keep raw cryptographic runtime/store APIs inside the composition container.
// A global send hook would bypass scope policy and expose a premature send path.
legacy.db.auth?.onAuthStateChange?.(event => {
  if (event === 'SIGNED_OUT') {
    void e2eDiagnostics.record('runtime_signed_out', { status: 'info' });
    void e2eSignalRuntime.dispose();
    e2eMessageStore.close();
  }
});
lifecycle.add(() => {
  e2eSignalRuntime.dispose();
  e2eMessageStore.close();
});
container.factory('channelRepository', c => new ChannelRepository(c.get('db')));
container.factory('groupRepository', c => new GroupRepository(c.get('db')));
container.factory('channelFeedRepository', c => new ChannelFeedRepository(c.get('db')));
container.factory('channelSettingsRepository', c => new ChannelSettingsRepository(c.get('db')));

const socialSurface = bindSocialSurface({
  client: legacy.db,
  e2eScopeRepository,
  getUser: legacy.getUser,
  getMessages: legacy.getMessages,
  getConversations: legacy.getConversations,
  getActiveConversation: legacy.getActiveConversation,
  notify: message => legacy.notify(message),
  logger,
  container,
  lifecycle,
  documentRef: document,
  windowRef: window
});
const directChat = socialSurface.directChat;
const reportService = socialSurface.reportService;
const forwardMessages = socialSurface.forwardMessages;

const shellSurface = bindShellSurface({
  client: legacy.db,
  getUser: legacy.getUser,
  notify: message => legacy.notify(message),
  logger,
  container,
  lifecycle,
  onBeforeSignOut: async () => {
    try { conversationState.stopRealtime?.(); } catch { /* ignore */ }
    try { typingPresence.dispose?.(); } catch { /* ignore */ }
    try { readReceipts.dispose?.(); } catch { /* ignore */ }
  },
  documentRef: document,
  windowRef: window
});
const sessionLifecycle = shellSurface.sessionLifecycle;
const notificationPreferences = shellSurface.notificationPreferences;
const memberCard = shellSurface.memberCard;
const callsPlaceholder = shellSurface.callsPlaceholder;
const navigationPages = shellSurface.navigationPages;
const composeChat = shellSurface.composeChat;
const imperialCabinet = shellSurface.imperialCabinet;
const searchController = shellSurface.searchController;

// Composition: chat info + pinned messages ownership.
bindChatAudience({
  client: legacy.db,
  getUser: legacy.getUser,
  notify: message => legacy.notify(message),
  logger,
  container,
  lifecycle,
  windowRef: window
});

const settingsSurface = bindSettingsSurface({
  client: legacy.db,
  getUser: legacy.getUser,
  notify: message => legacy.notify(message),
  logger,
  container,
  lifecycle,
  documentRef: document,
  windowRef: window,
  isImperator: () => window.isImperator?.() || false,
  getProfile: () => {
    try { return window.currentProfile || null; } catch { return null; }
  },
  setProfile: profile => {
    try { window.currentProfile = profile; } catch { /* ignore */ }
    try { globalThis.currentProfile = profile; } catch { /* ignore */ }
  }
});
const appearancePreferences = settingsSurface.appearancePreferences;
const privacySettings = settingsSurface.privacySettings;
const profileController = settingsSurface.profileController;
const blockList = settingsSurface.blockList;


const adminSurface = bindAdminSurface({
  client: legacy.db,
  e2eDiagnostics,
  getUser: legacy.getUser,
  notify: message => legacy.notify(message),
  logger,
  container,
  lifecycle,
  documentRef: document,
  windowRef: window
});
const imperialSession = adminSurface.imperialSession;
const adminCommands = adminSurface.adminCommands;


health.register('supabase-data-api', async () => { const { error } = await legacy.db.from('profiles').select('id').limit(1); if (error) throw error; });
health.register('local-indexeddb', async () => { if (!('indexedDB' in window)) throw new Error('IndexedDB unavailable'); });

// Direct-message identity is resolved before and after the legacy loader.
const repository = container.get('conversationRepository');
const messageRepository = container.get('messageRepository');
// Legacy UI keeps its public entry point, while membership-scoped data access belongs
// to the modular repository. The database's RLS policies remain authoritative.
window.rimResolveConversationForOpen = async (conversationId, userId) => {
  const result = await repository.getAccessibleConversation(conversationId, userId);
  if (!result.ok) throw result.error;
  return result.value;
};
const peerAvatars = new PeerAvatarService({
  storage: legacy.db.storage,
  logger
});
container.value('peerAvatars', peerAvatars);
lifecycle.add(() => peerAvatars.dispose());
const avatarUrlFor = peer => peerAvatars.urlFor(peer);
const applyPeerAvatar = (node, peer, fallback, sequence) =>
  peerAvatars.apply(node, peer, fallback, sequence ?? peerAvatars.getHeaderSequence());
let headerSequence = 0;
const setHeaderSequence = value => {
  headerSequence = value;
  peerAvatars.setHeaderSequence(value);
};

const sessionSurface = bindConversationSessionSurface({
  repository,
  client: legacy.db,
  getConversations: legacy.getConversations,
  setConversations: legacy.setConversations,
  getUser: legacy.getUser,
  getActiveConversation: legacy.getActiveConversation,
  getMessages: legacy.getMessages,
  avatarUrlFor,
  notify: message => legacy.notify(message),
  logger,
  container,
  lifecycle,
  windowRef: window
});
const conversationList = sessionSurface.conversationList;
const conversationState = sessionSurface.conversationState;
const conversationShell = sessionSurface.conversationShell;

// The first-party Zladen chat is installed server-side once the system identity is provisioned.
const zladenBot = new ZladenBotService({ client: legacy.db, getUser: legacy.getUser, logger });
container.value('zladenBot', zladenBot);
window.rimZladenBot = zladenBot;
const zladenSettings = new ZladenSettingsController({ service: zladenBot, isOwner: () => window.isImperator?.() === true, notify: message => legacy.notify(message), documentRef: document, windowRef: window });
window.rimOpenZladenSettings = () => zladenSettings.open();
container.value('zladenSettings', zladenSettings);
const ensureZladenChat = async () => {
  const result = await zladenBot.install();
  if (result.ok && result.value?.installed) {
    try { await conversationList.load(); } catch { /* the ordinary chat list can retry independently */ }
  }
};
if (legacy.getUser?.()?.id) void ensureZladenChat();
legacy.db.auth?.onAuthStateChange?.(event => {
  if (event === 'SIGNED_IN') void ensureZladenChat();
});
lifecycle.add(() => { try { delete window.rimZladenBot; delete window.rimOpenZladenSettings; } catch { /* ignore */ } });

const featuresSurface = bindFeaturesSurface({
  client: legacy.db,
  getUser: legacy.getUser,
  getMessages: () => {
    try { return context.getMessages?.() || legacy.getMessages?.() || []; }
    catch { return legacy.getMessages?.() || []; }
  },
  conversationList,
  logger,
  lifecycle,
  documentRef: document,
  windowRef: window
});
const favorites = featuresSurface.favorites;
const writer = featuresSurface.writer;
const music = featuresSurface.music;

window.RIM = Object.freeze({
  version: '4.1.8-iteration.174',
  container,
  events,
  logger,
  health,
  lifecycle,
  features: Object.freeze({ favorites, music, writer }),
  diagnostics: async () => health.run(),
  dispose: () => lifecycle.dispose()
});


const channelsSurface = bindChannelsSurface({
  client: legacy.db,
  getUser: legacy.getUser,
  notify: message => legacy.notify(message),
  logger,
  container,
  lifecycle,
  documentRef: document,
  windowRef: window
});
const channelDirectory = channelsSurface.channelDirectory;
const channelFeed = channelsSurface.channelFeed;
const channelSettings = channelsSurface.channelSettings;
const channelCommands = channelsSurface.channelCommands;
// Public channel deep links: /?channel=<uuid>&post=<uuid>.
const rimDeepLink = new URLSearchParams(window.location.search || '');
const rimDeepChannel = rimDeepLink.get('channel');
const rimDeepPost = rimDeepLink.get('post');
let rimDeepLinkHandled = false;
const openRimDeepLink = async () => {
  if (rimDeepLinkHandled || !rimDeepChannel || !legacy.getUser?.()?.id) return;
  rimDeepLinkHandled = true;
  try {
    await window.openChannel?.(rimDeepChannel);
    if (rimDeepPost) {
      const target = [...document.querySelectorAll('[data-rim-post-id]')].find(node => String(node.dataset.rimPostId) === String(rimDeepPost));
      target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }
  } catch (error) { logger.warn('channel.deep_link.open.failed', { message: error?.message }); }
};
void openRimDeepLink();
legacy.db.auth?.onAuthStateChange?.(event => { if (event === 'SIGNED_IN') void openRimDeepLink(); });
const botPlatform = new BotPlatformController({ client: legacy.db, documentRef: document, notify: message => legacy.notify(message), logger });
window.rimOpenBots = () => botPlatform.open();
container.value('botPlatform', botPlatform);
lifecycle.add(() => botPlatform.dispose());

const groupsSurface = bindGroupsSurface({
  client: legacy.db,
  getUser: legacy.getUser,
  getConversations: legacy.getConversations,
  notify: message => legacy.notify(message),
  logger,
  container,
  lifecycle,
  documentRef: document,
  windowRef: window
});
const groupSettings = groupsSurface.groupSettings;
const groupCommands = groupsSurface.groupCommands;


legacy.db.auth?.onAuthStateChange?.(event => {
  if (event === 'SIGNED_OUT') {
    channelDirectory.invalidate();
    groupSettings.invalidate();
    channelFeed.invalidate();
    channelFeed.close();
    channelSettings.invalidate();
  }
});
const timelineSurface = bindMessageTimelineSurface({
  messageRepository,
  loadLocalMessages: conversation => e2eSignalRuntime.getLocalConversation(conversation.id, { limit: 500 }),
  getUser: legacy.getUser,
  getActiveConversation: legacy.getActiveConversation,
  getMessages: legacy.getMessages,
  setMessages: legacy.setMessages,
  setReplyTarget: legacy.setReplyTarget,
  notify: message => legacy.notify(message),
  logger,
  container,
  lifecycle,
  documentRef: document,
  windowRef: window,
  pageSize: 50
});
const timeline = timelineSurface.timeline;
const replyTargets = timelineSurface.replyTargets;
const loadAndMarkActiveTimeline = timelineSurface.loadAndMarkActiveTimeline;

const messageCommandsSurface = bindMessageCommandsSurface({
  messageRepository,
  e2eScopeRepository: container.get('e2eScopeRepository'),
  e2eRuntime: e2eSignalRuntime,
  storage: legacy.db.storage,
  client: legacy.db,
  getUser: legacy.getUser,
  getConversation: legacy.getActiveConversation,
  getReplyTarget: legacy.getReplyTarget,
  setReplyTarget: legacy.setReplyTarget,
  getMessages: legacy.getMessages,
  setMessages: legacy.setMessages,
  getTopicId: () => {
    try { return window.activeTopicId || null; } catch { return null; }
  },
  noteOutgoing: async () => {
    try {
      await conversationState.hydrateActivity?.();
      conversationState.sort?.();
      await conversationState.refreshUnread?.();
    } catch { /* ignore */ }
  },
  notify: message => legacy.notify(message),
  logger,
  container,
  lifecycle,
  documentRef: document,
  windowRef: window
});
const messageCommands = messageCommandsSurface.messageCommands;

legacy.db.auth?.onAuthStateChange?.(event => {
  if (event === 'SIGNED_OUT') setTimeout(() => timeline.unsubscribe(), 0);
});


const chatRuntime = bindChatRuntimeSurface({
  client: legacy.db,
  e2eScopeRepository,
  getUser: legacy.getUser,
  getActiveConversation: legacy.getActiveConversation,
  getMessages: legacy.getMessages,
  notify: message => legacy.notify(message),
  logger,
  container,
  lifecycle,
  documentRef: document,
  windowRef: window
});
const readReceipts = chatRuntime.readReceipts;
const messageDecorations = chatRuntime.messageDecorations;
const messageListRenderer = chatRuntime.messageListRenderer;
const voiceMessages = chatRuntime.voiceMessages;
const typingPresence = chatRuntime.typingPresence;
const ownPresence = chatRuntime.ownPresence;

const entrypointSurface = bindLegacyEntrypointSurface({
  conversationList,
  conversationState,
  messageListRenderer,
  messageDecorations,
  readReceipts,
  logger,
  lifecycle,
  windowRef: window
});
const entrypoints = entrypointSurface.entrypoints;
lifecycle.add(() => readReceipts.dispose());


legacy.db.auth?.onAuthStateChange?.(event => {
  if (event === 'SIGNED_OUT') {
    typingPresence.unbind().catch(() => {});
    conversationState.stopRealtime().catch(error => logger.warn('chat.state.signout.cleanup.failed', { message: error?.message }));
  }
});

const openSurface = bindConversationOpenSurface({
  repository,
  conversationShell,
  getUser: legacy.getUser,
  getConversations: legacy.getConversations,
  setConversations: list => {
    try { legacy.setConversations?.(list); } catch { /* ignore */ }
    try { window.conversations = list; } catch { /* ignore */ }
  },
  getActiveConversation: legacy.getActiveConversation,
  setActiveConversation: legacy.setActiveConversation,
  setReplyTarget: legacy.setReplyTarget,
  resolveChatHeader,
  applyPeerAvatar,
  getHeaderSequence: () => headerSequence,
  setHeaderSequence: setHeaderSequence,
  onBeforeOpen: async ({ sequence }) => {
    if (document.getElementById('rimWorkspaceOverlay')) await writer.closeForNavigation();
    favorites.close();
    return true;
  },
  readReceipts,
  typingPresence,
  events,
  context,
  legacy,
  logger,
  container,
  lifecycle,
  entrypoints,
  documentRef: document,
  windowRef: window
});
const conversationNavigation = openSurface.conversationNavigation;
const conversationOpenService = openSurface.conversationOpenService;
const conversationOpen = openSurface.conversationOpen;



logger.info('app.ready', { modules: ['core', 'supabase-adapter', 'chat-identity', 'conversation-list', 'message-timeline-pagination', 'incremental-realtime', 'message-command-service', 'legacy-loader-unification', 'timeline-race-reconciliation', 'conversation-state-projection', 'conversation-open-coordinator', 'conversation-navigation-state', 'read-receipts', 'channel-directory', 'group-settings', 'channel-feed', 'channel-settings', 'typing-presence', 'voice-messages', 'admin-commands', 'legacy-entrypoint-registry', 'favorites', 'lite-writer', 'local-music'] });
// Resolve the classic bootstrap barrier only after every application surface
// and every global compatibility wrapper has been installed. This prevents a
// fast Supabase session restore from running the temporary no-op chat loader.
window.__rimMarkAppModulesReady?.();
window.dispatchEvent(new CustomEvent('rim:ready', { detail: { version: '4.1.8-iteration.174' } }));
