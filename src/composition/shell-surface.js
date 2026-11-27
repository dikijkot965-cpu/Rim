/**
 * Composition: app shell services — session, notifications, nav, compose, member card, calls, search, imperial cabinet.
 */
import { SessionLifecycleService } from '../application/session-lifecycle-service.js';
import { NotificationPreferencesService } from '../application/notification-preferences-service.js';
import { MemberCardController } from '../application/member-card-controller.js';
import { CallsPlaceholderController } from '../application/calls-placeholder-controller.js';
import { NavigationPagesController } from '../application/navigation-pages-controller.js';
import { ComposeChatService } from '../application/compose-chat-service.js';
import { ImperialCabinetController } from '../application/imperial-cabinet-controller.js';
import { ImperialFeaturesController } from '../application/imperial-features-controller.js';
import { AuthFormController } from '../application/auth-form-controller.js';
import { SearchController } from '../application/search-controller.js';
import { TabbarController } from '../application/tabbar-controller.js';
import { ShellPageController } from '../application/shell-page-controller.js';
import { ShellModalController } from '../application/shell-modal-controller.js';
import { NavigationSectionController } from '../application/navigation-section-controller.js';
import { ComposerChromeController } from '../application/composer-chrome-controller.js';
import { ViewportController } from '../application/viewport-controller.js';
import { AppBootstrapController } from '../application/app-bootstrap-controller.js';
import { ConnectionStatusController } from '../application/connection-status-controller.js';

/**
 * @param {object} deps
 */
export function bindShellSurface({
  client = null,
  getUser,
  notify,
  logger,
  container,
  lifecycle,
  onBeforeSignOut = async () => {},
  documentRef = globalThis.document,
  windowRef = globalThis.window
} = {}) {
  const win = windowRef;

  const sessionLifecycle = new SessionLifecycleService({
    client,
    notify,
    onBeforeSignOut,
    logger
  });
  container?.value?.('sessionLifecycle', sessionLifecycle);
  win.__RIM_SESSION_LIFECYCLE_OWNED = true;
  win.signOut = () => sessionLifecycle.signOut();
  lifecycle?.add?.(() => { win.__RIM_SESSION_LIFECYCLE_OWNED = false; });

  const shellModal = new ShellModalController({ documentRef, windowRef: win });
  shellModal.bindGlobals();
  container?.value?.('shellModal', shellModal);
  lifecycle?.add?.(() => shellModal.dispose());


  // The early entrypoint already owns the auth controller and processes
  // Telegram's one-time callback. Reuse it; never create a second callback consumer.
  const authForm = win.__RIM_AUTH_FORM_CONTROLLER || new AuthFormController({
    client: client || container?.get?.('client') || win.__RIM_LEGACY_CONTEXT?.db || null,
    documentRef,
    windowRef: win,
    onSignedIn: async user => {
      win.currentUser = user;
      const startup = typeof win.initializeApp === 'function' ? win.initializeApp() : Promise.resolve();
      await startup;
      await win.rimMaybeShowSecurityOnboarding?.();
    },
    logger
  });
  if (!win.__RIM_AUTH_FORM_CONTROLLER) {
    authForm.bindGlobals();
    win.__RIM_AUTH_FORM_CONTROLLER = authForm;
  }
  container?.value?.('authForm', authForm);
  lifecycle?.add?.(() => { win.__RIM_AUTH_FORM_OWNED = false; });

  const appBootstrap = new AppBootstrapController({
    documentRef,
    windowRef: win,
    getUser,
    loadProfile: async () => { await win.loadProfile?.(); },
    loadSettings: async () => { await win.loadSettings?.(); },
    loadConversations: async () => { await win.loadConversations?.(); },
    loadChannels: async () => { await win.loadChannels?.(); },
    notify,
    logger,
    mirrorState: () => { try { win.__rimMirrorLegacyState?.(); } catch {} }
  });
  appBootstrap.bindGlobals();
  container?.value?.('appBootstrap', appBootstrap);
  lifecycle?.add?.(() => appBootstrap.dispose());



  const notificationPreferences = new NotificationPreferencesService({
    client,
    getUser,
    notify,
    logger
  });
  container?.value?.('notificationPreferences', notificationPreferences);
  win.__RIM_NOTIFICATION_PREFS_OWNED = true;
  win.openNotificationSettings = () => notificationPreferences.open();
  win.saveNotificationSettings = async () => {
    const result = await notificationPreferences.saveFromDom();
    if (!result.ok) notify?.(result.error?.message || 'Не удалось сохранить настройки');
    return result;
  };
  win.subscribePushLocally = async () => {
    const result = await notificationPreferences.subscribePush();
    if (!result.ok) notify?.(result.error?.message || 'Не удалось подключить push');
    return result;
  };
  win.unsubscribePushLocally = async () => {
    const result = await notificationPreferences.unsubscribePush();
    if (!result.ok) notify?.(result.error?.message || 'Не удалось отключить push');
    return result;
  };
  lifecycle?.add?.(() => { win.__RIM_NOTIFICATION_PREFS_OWNED = false; });

  const memberCard = new MemberCardController({
    client,
    getUser,
    getProfile: () => {
      try { return win.currentProfile || null; } catch { return null; }
    },
    notify,
    logger
  });
  container?.value?.('memberCard', memberCard);
  win.__RIM_MEMBER_CARD_OWNED = true;
  win.openMemberCard = () => memberCard.open();
  lifecycle?.add?.(() => { win.__RIM_MEMBER_CARD_OWNED = false; });

  const callsPlaceholder = new CallsPlaceholderController();
  container?.value?.('callsPlaceholder', callsPlaceholder);
  win.__RIM_CALLS_PLACEHOLDER_OWNED = true;
  win.rimCalls = () => callsPlaceholder.open();
  lifecycle?.add?.(() => { win.__RIM_CALLS_PLACEHOLDER_OWNED = false; });

  const shellPage = new ShellPageController({ documentRef, windowRef: win });
  shellPage.bindGlobals();
  container?.value?.('shellPage', shellPage);
  lifecycle?.add?.(() => shellPage.dispose());

  const navigationPages = new NavigationPagesController({
    openPage: (title, html) => shellPage.fullPage(title, html),
    setNavActive: which => shellPage.setNavActive(which),
    windowRef: win
  });
  container?.value?.('navigationPages', navigationPages);
  win.__RIM_NAV_PAGES_OWNED = true;
  win.openMorePage = () => navigationPages.openMore();
  win.openToolsPage = () => navigationPages.openTools();
  lifecycle?.add?.(() => { win.__RIM_NAV_PAGES_OWNED = false; });

  const tabbar = new TabbarController({ documentRef, windowRef: win });
  container?.value?.('tabbar', tabbar);
  win.__RIM_TABBAR_OWNED = true;
  tabbar.start();
  lifecycle?.add?.(() => {
    win.__RIM_TABBAR_OWNED = false;
    tabbar.dispose();
  });

  const sectionNav = new NavigationSectionController({
    documentRef,
    windowRef: win,
    loadChannels: async () => { await win.loadChannels?.(); },
    loadMusic: async () => { await win.loadMusic?.(); },
    logger
  });
  sectionNav.bindGlobals();
  container?.value?.('sectionNav', sectionNav);
  lifecycle?.add?.(() => sectionNav.dispose());

  const composerChrome = new ComposerChromeController({
    documentRef,
    windowRef: win,
    sendMessage: () => win.sendMessage?.(),
    notify,
    logger
  });
  composerChrome.bindGlobals();
  composerChrome.installDomHooks();
  container?.value?.('composerChrome', composerChrome);
  lifecycle?.add?.(() => composerChrome.dispose());

  const viewport = new ViewportController({ documentRef, windowRef: win, logger });
  viewport.bindGlobals();
  viewport.install();
  container?.value?.('viewport', viewport);
  lifecycle?.add?.(() => viewport.dispose());

  const connectionStatus = new ConnectionStatusController({ documentRef, windowRef: win, logger });
  connectionStatus.bind();
  container?.value?.('connectionStatus', connectionStatus);
  win.__RIM_CONNECTION_STATUS_OWNED = true;
  win.rimRefreshConnectionStatus = () => connectionStatus.refresh();
  lifecycle?.add?.(() => {
    connectionStatus.dispose();
    win.__RIM_CONNECTION_STATUS_OWNED = false;
  });



  const composeChat = new ComposeChatService({
    client,
    getUser,
    notify,
    reloadConversations: async () => { await win.loadConversations?.(); },
    openConversation: async id => { await win.openConversation?.(id); },
    startSecretWith: userId => win.startSecretChatWith?.(userId),
    logger
  });
  container?.value?.('composeChat', composeChat);
  win.__RIM_COMPOSE_CHAT_OWNED = true;
  win.newDirectChat = async () => {
    const result = await composeChat.newDirect();
    if (!result.ok) notify?.(result.error?.message || 'Не удалось создать чат');
    return result;
  };
  win.newGroupChat = async () => {
    const result = await composeChat.newGroup();
    if (!result.ok) notify?.(result.error?.message || 'Не удалось создать группу');
    return result;
  };
  win.newSecretDirectChat = async () => {
    const result = await composeChat.newSecretDirect();
    if (!result.ok) notify?.(result.error?.message || 'Не удалось создать секретный чат');
    return result;
  };
  lifecycle?.add?.(() => {
    win.__RIM_COMPOSE_CHAT_OWNED = false;
    try { delete win.newSecretDirectChat; } catch { /* ignore */ }
  });

  const imperialCabinet = new ImperialCabinetController({
    notificationCount: () => {
      try { return win.IMPERIAL_FEATURES?.notificationCount || 0; } catch { return 0; }
    }
  });
  container?.value?.('imperialCabinet', imperialCabinet);
  win.__RIM_IMPERIAL_CABINET_OWNED = true;
  win.openImperialCabinet = () => imperialCabinet.open();
  const imperialFeatures = new ImperialFeaturesController({
    client: client || container?.get?.('client') || win.__RIM_LEGACY_CONTEXT?.db || null,
    getUser: () => win.__RIM_LEGACY_CONTEXT?.getUser?.() || win.currentUser,
    isImperator: () => win.isImperator?.() === true,
    showModal: (html) => win.showModal?.(html),
    notify: (msg) => win.toast?.(msg) || win.notify?.(msg),
    windowRef: win
  });
  // Prefer injected client from app if present later
  imperialFeatures.bindGlobals();
  container?.value?.('imperialFeatures', imperialFeatures);

  lifecycle?.add?.(() => { win.__RIM_IMPERIAL_CABINET_OWNED = false; });

  const searchController = new SearchController({
    client,
    getUser,
    logger
  });
  container?.value?.('search', searchController);
  win.__RIM_SEARCH_OWNED = true;
  win.rimSearch = () => searchController.open();
  win.rimSetSearchKind = (kind, button) => searchController.setKind(kind, button);
  win.rimDoSearch = () => searchController.schedule(0);
  lifecycle?.add?.(() => {
    win.__RIM_SEARCH_OWNED = false;
    searchController.dispose?.();
  });

  logger?.info?.('composition.shellSurface.bound', {});
  return {
    sessionLifecycle,
    notificationPreferences,
    memberCard,
    callsPlaceholder,
    shellPage,
    navigationPages,
    tabbar,
    composeChat,
    imperialCabinet,
    searchController
  };
}
