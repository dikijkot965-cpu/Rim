/**
 * Owns imperial role / session feature flags used across admin and UI gates.
 * Does not own the full admin panel DOM — only the authorization projection.
 */
export class ImperialSessionController {
  constructor({
    client,
    getUser,
    windowRef = globalThis.window,
    logger = null
  } = {}) {
    this.client = client;
    this.getUser = getUser;
    this.window = windowRef;
    this.logger = logger;
    this.state = {
      admin: false,
      role: null,
      memberNumber: null,
      notificationCount: 0
    };
    this.disposed = false;
  }

  get features() {
    return { ...this.state };
  }

  isAdmin() {
    return this.state.admin === true;
  }

  isImperator() {
    return this.isAdmin();
  }

  #syncGlobals() {
    const target = this.window?.IMPERIAL_FEATURES || (this.window.IMPERIAL_FEATURES = {
      admin: false,
      memberNumber: null,
      unreadCount: 0,
      notificationCount: 0,
      channelWallpaperUrl: null,
      personalWallpaperUrl: null,
      bulletinRows: [],
      achievementRows: []
    });
    target.admin = this.state.admin;
    if (this.state.memberNumber != null) target.memberNumber = this.state.memberNumber;
    target.notificationCount = this.state.notificationCount;
  }

  async loadRole() {
    if (this.disposed) return this.state;
    const user = this.getUser?.();
    if (!user?.id) {
      this.state.admin = false;
      this.state.role = null;
      this.#syncGlobals();
      return this.state;
    }

    try {
      const { data, error } = await this.client
        .from('app_user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      const role = data?.role || null;
      this.state.role = role;
      this.state.admin = role === 'superadmin';
      this.#syncGlobals();
      return this.state;
    } catch (error) {
      this.logger?.warn?.('imperial.role.load.failed', { message: error?.message });
      return this.state;
    }
  }

  async loadNotificationBadge() {
    if (this.disposed) return 0;
    const user = this.getUser?.();
    if (!user?.id) return 0;
    try {
      const { count, error } = await this.client
        .from('app_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      if (error) throw error;
      this.state.notificationCount = Number(count) || 0;
      this.#syncGlobals();
      return this.state.notificationCount;
    } catch (error) {
      this.logger?.warn?.('imperial.notifications.count.failed', { message: error?.message });
      return this.state.notificationCount;
    }
  }

  dispose() {
    this.disposed = true;
  }
}
