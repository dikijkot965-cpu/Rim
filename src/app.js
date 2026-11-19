import { Container } from './core/container.js';
import { EventBus } from './core/event-bus.js';
import { Logger } from './core/logger.js';
import { HealthRegistry } from './core/health.js';
import { DisposableScope } from './core/disposable-scope.js';
import { ConversationRepository } from './infrastructure/supabase/conversation-repository.js';
import { MessageRepository } from './infrastructure/supabase/message-repository.js';
import { resolveChatHeader } from './application/resolve-chat-header.js';
import { PeerAvatarService } from './application/peer-avatar-service.js';
import { bindChatAudience } from './composition/chat-audience.js';
import { bindSettingsSurface } from './composition/settings-surface.js';
import { bindChannelsSurface } from './composition/channels-surface.js';
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

const context = window.__RIM_LEGACY_CONTEXT;
if (!context?.db) throw new Error('RIM bootstrap: legacy database client is unavailable');
const legacy = createLegacyBridge(context);
const container = new Container();
const logger = new Logger({ version: '4.0.0-iteration.122' });
const events = new EventBus();
const health = new HealthRegistry();
const lifecycle = new DisposableScope({ onError: error => logger.error('lifecycle.dispose.failed', error) });
container.value('db', legacy.db).value('logger', logger).value('events', events).value('health', health);
container.factory('conversationRepository', c => new ConversationRepository(c.get('db')));
container.factory('messageRepository', c => new MessageRepository(c.get('db'), { pageSize: 50 }));
container.factory('channelRepository', c => new ChannelRepository(c.get('db')));
container.factory('groupRepository', c => new GroupRepository(c.get('db')));
container.factory('channelFeedRepository', c => new ChannelFeedRepository(c.get('db')));
container.factory('channelSettingsRepository', c => new ChannelSettingsRepository(c.get('db')));

const socialSurface = bindSocialSurface({
  client: legacy.db,
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
  version: '4.0.0-iteration.122',
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
window.dispatchEvent(new CustomEvent('rim:ready', { detail: { version: '4.0.0-iteration.122' } }));
