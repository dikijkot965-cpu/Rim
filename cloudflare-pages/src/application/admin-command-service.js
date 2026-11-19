import { Err, Ok } from '../core/result.js';

/**
 * Admin mutation boundary over existing tables/RPCs.
 * Authorization is enforced by canManage (typically superadmin projection).
 */
export class AdminCommandService {
  constructor({
    client,
    getUser,
    canManage = () => false,
    notify = () => {},
    documentRef = globalThis.document,
    confirm = globalThis.confirm?.bind(globalThis),
    logger = null
  } = {}) {
    this.client = client;
    this.getUser = getUser;
    this.canManage = canManage;
    this.notify = notify;
    this.document = documentRef;
    this.confirm = confirm || (() => true);
    this.logger = logger;
    this.inFlight = new Set();
  }

  async exclusive(key, operation) {
    if (this.inFlight.has(key)) return Err(new Error('Операция уже выполняется.'));
    this.inFlight.add(key);
    try { return await operation(); }
    catch (error) { return Err(error); }
    finally { this.inFlight.delete(key); }
  }

  #requireAdmin() {
    const user = this.getUser?.();
    if (!user?.id) return Err(new Error('Сначала войдите в аккаунт.'));
    if (!this.canManage()) return Err(new Error('Доступ закрыт: требуется роль superadmin.'));
    return Ok(user);
  }

  async toggleAds(enabled) {
    const admin = this.#requireAdmin();
    if (!admin.ok) return admin;

    return this.exclusive('admin-toggle-ads', async () => {
      const { error } = await this.client
        .from('rim_platform_settings')
        .update({
          ads_enabled: !!enabled,
          updated_by: admin.value.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', true);
      if (error) return Err(error);
      return Ok(!!enabled);
    });
  }

  async setUserRole(userId, role) {
    const admin = this.#requireAdmin();
    if (!admin.ok) return admin;
    if (!userId) return Err(new Error('Не указан пользователь.'));
    const normalized = String(role || '').trim();
    if (!['user', 'moderator', 'admin', 'superadmin'].includes(normalized)) {
      return Err(new Error('Некорректная роль.'));
    }

    return this.exclusive(`admin-role:${userId}`, async () => {
      const { error } = await this.client.rpc('rim_admin_update_user_role', {
        p_user_id: userId,
        p_role: normalized
      });
      if (error) return Err(error);
      return Ok(true);
    });
  }

  async listUsers({ limit = 150, offset = 0 } = {}) {
    const admin = this.#requireAdmin();
    if (!admin.ok) return admin;

    const { data, error } = await this.client.rpc('rim_admin_list_users', {
      p_limit: limit,
      p_offset: offset
    });
    if (error) return Err(error);
    return Ok(data || []);
  }

  async searchUsers(query, { limit = 100 } = {}) {
    const admin = this.#requireAdmin();
    if (!admin.ok) return admin;
    const q = String(query || '').trim().replace(/^@/, '');
    if (q.length < 2) return Err(new Error('Введите минимум два символа для поиска.'));

    const { data, error } = await this.client.rpc('rim_admin_search_users', {
      p_query: q,
      p_limit: limit
    });
    if (error) return Err(error);
    return Ok(data || []);
  }

  normalizeAdUrl(url) {
    let value = String(url ?? '').trim() || null;
    if (!value) return Ok(null);
    if (/^@[a-z0-9_]{3,24}$/i.test(value)) return Ok('rim:' + value);
    if (/^tg:@[a-z0-9_]{3,32}$/i.test(value)) return Ok(value);
    if (/^rim:@[a-z0-9_]{3,24}$/i.test(value)) return Ok(value);
    if (/^https?:\/\//i.test(value)) return Ok(value);
    return Err(new Error('Укажите https://ссылку, @username канала РИМа или tg:@username канала Telegram.'));
  }

  async saveAd({
    title,
    body,
    url = null,
    channelId = null,
    imageFile = null,
    amount = 0,
    paymentStatus = 'unpaid'
  } = {}) {
    const admin = this.#requireAdmin();
    if (!admin.ok) return admin;

    const adTitle = String(title ?? '').trim();
    const adBody = String(body ?? '').trim();
    if (!adTitle || !adBody) return Err(new Error('Заполните заголовок и текст объявления.'));

    const urlResult = this.normalizeAdUrl(url);
    if (!urlResult.ok) return urlResult;
    const destination = urlResult.value;

    const contractAmount = Number(amount);
    if (!Number.isFinite(contractAmount) || contractAmount < 0) {
      return Err(new Error('Некорректная сумма договора.'));
    }

    if (imageFile) {
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(imageFile.type) || imageFile.size > 5 * 1024 * 1024) {
        return Err(new Error('Изображение должно быть JPG, PNG, WEBP или GIF до 5 МБ.'));
      }
    }

    return this.exclusive('admin-save-ad', async () => {
      let media = null;
      if (imageFile) {
        const ext = (imageFile.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const path = `${admin.value.id}/${crypto.randomUUID()}.${ext}`;
        const { error: up } = await this.client.storage.from('rim-advertising').upload(path, imageFile, {
          contentType: imageFile.type,
          upsert: false
        });
        if (up) return Err(up);
        media = path;
      }

      const { data: campaign, error } = await this.client
        .from('ad_campaigns')
        .insert({
          title: adTitle,
          body: adBody,
          media_url: media,
          destination_url: destination,
          placement: 'channel_feed',
          status: 'active',
          created_by: admin.value.id
        })
        .select('id')
        .single();
      if (error) {
        if (media) {
          try { await this.client.storage.from('rim-advertising').remove([media]); } catch { /* ignore */ }
        }
        return Err(error);
      }

      if (channelId) {
        const { error: te } = await this.client.from('ad_campaign_targets').insert({
          campaign_id: campaign.id,
          target_type: 'channel',
          channel_id: channelId
        });
        if (te) {
          await this.client.from('ad_campaigns').delete().eq('id', campaign.id);
          if (media) {
            try { await this.client.storage.from('rim-advertising').remove([media]); } catch { /* ignore */ }
          }
          return Err(te);
        }
      }

      const { error: fe } = await this.client.from('ad_campaign_financials').upsert({
        campaign_id: campaign.id,
        contract_amount: contractAmount,
        currency: 'RUB',
        payment_status: paymentStatus || 'unpaid',
        updated_at: new Date().toISOString()
      });
      if (fe) {
        return Ok({ campaign, warning: 'Кампания создана, но финансовая запись не сохранена: ' + (fe.message || fe) });
      }
      return Ok({ campaign });
    });
  }

  async listCampaigns({ limit = 100 } = {}) {
    const admin = this.#requireAdmin();
    if (!admin.ok) return admin;
    const { data, error } = await this.client
      .from('ad_campaigns')
      .select('id,title,body,media_url,destination_url,placement,status,created_at,starts_at,ends_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return Err(error);
    return Ok(data || []);
  }

  async sendNotice({ username = '', title, body } = {}) {
    const admin = this.#requireAdmin();
    if (!admin.ok) return admin;
    const noticeTitle = String(title ?? '').trim();
    const noticeBody = String(body ?? '').trim();
    if (!noticeTitle || !noticeBody) {
      return Err(new Error('Заполните заголовок и текст обращения.'));
    }

    return this.exclusive('admin-send-notice', async () => {
      let userId = null;
      const raw = String(username ?? '').trim().replace(/^@/, '');
      if (raw) {
        const { data, error } = await this.client
          .from('profiles')
          .select('id')
          .eq('username', raw)
          .maybeSingle();
        if (error) return Err(error);
        if (!data) return Err(new Error('Пользователь с таким username не найден.'));
        userId = data.id;
      }

      const { data, error } = await this.client.rpc('rim_admin_send_notice', {
        p_user_id: userId,
        p_title: noticeTitle,
        p_body: noticeBody
      });
      if (error) return Err(error);
      return Ok(data);
    });
  }

  async dashboardStats({ days = 14 } = {}) {
    const admin = this.#requireAdmin();
    if (!admin.ok) return admin;

    const [stats, series] = await Promise.all([
      this.client.rpc('rim_admin_dashboard_stats'),
      this.client.rpc('rim_admin_analytics_timeseries', { p_days: days })
    ]);
    if (stats.error) return Err(stats.error);
    return Ok({
      stats: stats.data || {},
      series: series.error ? [] : (series.data || []),
      seriesError: series.error || null
    });
  }

  async findAdChannels(query, { limit = 30 } = {}) {
    const admin = this.#requireAdmin();
    if (!admin.ok) return admin;
    const raw = String(query ?? '').trim();
    if (raw.length < 2) return Err(new Error('Введите минимум два символа.'));
    const term = raw.replace(/[,%()]/g, ' ').trim();
    if (term.length < 2) return Err(new Error('Введите минимум два символа.'));

    const { data, error } = await this.client
      .from('channels')
      .select('id,title,username')
      .or(`title.ilike.%${term}%,username.ilike.%${term}%`)
      .order('title')
      .limit(limit);
    if (error) return Err(error);
    return Ok(data || []);
  }

  async listSessions(userId) {
    const admin = this.#requireAdmin();
    if (!admin.ok) return admin;
    if (!userId) return Err(new Error('Не указан пользователь.'));
    const { data, error } = await this.client.rpc('rim_admin_list_sessions', {
      p_user_id: userId
    });
    if (error) return Err(error);
    return Ok(data || []);
  }

  async revokeSession(sessionId, { skipConfirm = false } = {}) {
    const admin = this.#requireAdmin();
    if (!admin.ok) return admin;
    if (!sessionId) return Err(new Error('Не указан сеанс.'));
    if (!skipConfirm && !this.confirm('Завершить сеанс?')) return Ok({ cancelled: true });
    const { error } = await this.client.rpc('rim_admin_revoke_session', {
      p_session_id: sessionId
    });
    if (error) return Err(error);
    return Ok(true);
  }
}
