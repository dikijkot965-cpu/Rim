/* RIM auth + system-bot bridge. Kept outside the classic bootstrap to preserve its small compatibility surface. */
(() => {
  'use strict';
  // Telegram sign-in and its OIDC callback are owned exclusively by the
  // modular AuthFormController/TelegramAuthService. This file must not replace
  // window.signInWithTelegram or race a second callback exchange/verifyOtp request.

  let installBusy = false;
  async function ensureZladenInstalled() {
    const user = window.__RIM_LEGACY_CONTEXT?.getUser?.() || window.currentUser;
    const db = window.db;
    if (!user?.id || !db || window.__RIM_ZLADEN_INSTALL_DONE || installBusy) return;
    installBusy = true;
    try {
      const { data, error } = await db.functions.invoke('rim-zladen', { body: { action: 'install' } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'zladen_install_failed');
      const result = data.result || {};
      if (result.installed === true) {
        window.__RIM_ZLADEN_INSTALL_DONE = true;
        if (typeof window.loadConversations === 'function') await window.loadConversations();
        if (typeof window.renderConversationList === 'function') window.renderConversationList();
        console.info('RIM Zladen installed:', result.conversation_id || 'ready');
      } else if (result.state === 'blocked' || result.state === 'unsubscribed') {
        window.__RIM_ZLADEN_INSTALL_DONE = true;
        console.info('RIM Zladen remains', result.state, 'by user preference.');
      }
    } catch (error) {
      console.warn('RIM Zladen auto-install deferred:', error?.message || error);
    } finally {
      installBusy = false;
    }
  }
  window.__RIM_ZLADEN_AFTER_INIT = () => { void ensureZladenInstalled(); };

  // Fallback for module-owned initialization paths; defer outside Supabase's auth callback lock.
  if (window.db?.auth) {
    window.db.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        setTimeout(() => { void ensureZladenInstalled(); }, 6000);
      }
    });
    window.db.auth.getSession().then(({ data, error }) => {
      if (!error && data?.session?.user) setTimeout(() => { void ensureZladenInstalled(); }, 6000);
    }).catch(error => console.warn('RIM Zladen session bootstrap:', error));
  }

})();
