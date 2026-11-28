import { Err, Ok } from '../../core/result.js';
import { normalizeE2EScope, evaluateE2EReadiness } from '../../security/e2e/scope-policy.js';

/** Supabase adapter for E2E eligibility and readiness. It never stores private keys. */
export class E2EScopeRepository {
  constructor(client, { protocolReady = false, isScopeVerified = null } = {}) {
    this.client = client;
    this.protocolReady = protocolReady;
    this.isScopeVerified = isScopeVerified;
  }

  async getScope(scopeInput, userId) {
    let scope;
    try { scope = normalizeE2EScope(scopeInput); }
    catch (error) { return Err(error); }
    if (!userId) return Err(new Error('Для проверки E2E требуется авторизация.'));
    if (!scope.eligible) return Ok({ scope, enabled: false, readiness: { ready: false, reason: scope.reason } });

    const table = scope.type === 'private_channel' ? 'channels' : 'conversations';
    const fields = scope.type === 'private_channel'
      ? 'id,is_public,e2e_mode,e2e_epoch'
      : 'id,type,is_private,is_secret,e2e_mode,e2e_epoch';
    const result = await this.client.from(table).select(fields).eq('id', scope.id).maybeSingle();
    if (result.error) {
      // Before the E2E foundation migration exists, the database cannot mark
      // a conversation as required. Preserve legacy messaging only for the
      // precise missing-column/schema-cache error; all other lookup failures
      // fail closed in the caller.
      const code = String(result.error.code || '');
      const message = String(result.error.message || '');
      if ((code === '42703' || code === 'PGRST204') && /e2e_mode/i.test(message)) {
        return Ok({ scope, enabled: false, schemaUnavailable: true, readiness: { ready: false, reason: 'E2E-схема ещё не установлена.' } });
      }
      return Err(result.error);
    }
    if (!result.data) return Err(new Error('Переписка не найдена или недоступна.'));

    // `off` and `pending` scopes still use the existing message path. Avoid
    // querying device registries/RPCs until a trusted deployment marks the
    // scope `required`; this also keeps pre-Relay deployments compatible.
    const mode = result.data.e2e_mode;
    if (mode === 'off' || mode === 'pending') {
      const pendingSecretRequest = scope.type === 'direct' && result.data.is_secret !== true && mode === 'pending';
      const reason = pendingSecretRequest
        ? 'Секретный чат ожидает принятия приглашения. Отправка сообщений пока заблокирована.'
        : (mode === 'pending' ? 'E2E ожидает активации; сообщения пока не заявляются как защищённые.' : null);
      return Ok({
        scope: { ...scope, ...result.data, pendingSecretRequest },
        enabled: false,
        pendingSecretRequest,
        plaintextBlocked: pendingSecretRequest,
        readiness: { ready: false, reason }
      });
    }
    if (mode !== 'required') return Err(new Error('Неизвестный режим E2E переписки. Отправка остановлена для предотвращения plaintext fallback.')); 

    const membershipTable = scope.type === 'private_channel' ? 'channel_members' : 'conversation_members';
    const membershipKey = scope.type === 'private_channel' ? 'channel_id' : 'conversation_id';
    const membership = await this.client.from(membershipTable).select('user_id').eq(membershipKey, scope.id).eq('user_id', userId).maybeSingle();
    if (membership.error) return Err(membership.error);
    if (!membership.data) return Err(new Error('Нет доступа к этой переписке.'));

    const members = await this.client.from(membershipTable).select('user_id').eq(membershipKey, scope.id);
    if (members.error) return Err(members.error);
    const devices = await this.client.rpc('rim_e2e_get_scope_device_readiness', {
      p_scope_type: scope.type,
      p_scope_id: scope.id
    });
    if (devices.error) return Err(devices.error);

    const readinessScope = { ...scopeInput, ...result.data };
    const protocolReady = typeof this.isScopeVerified === 'function'
      ? this.isScopeVerified(readinessScope) === true
      : typeof this.protocolReady === 'function'
        ? this.protocolReady(readinessScope) === true
        : this.protocolReady === true;
    const readiness = evaluateE2EReadiness({ scope: readinessScope, members: members.data || [], devices: devices.data || [], protocolReady });
    const peerUserId = scope.type === 'direct' ? (members.data || []).map(row => String(row.user_id)).find(id => id !== String(userId)) || null : null;
    return Ok({ scope: { ...scope, ...result.data }, enabled: result.data.e2e_mode === 'required', readiness, peerUserId, memberUserIds: [...new Set((members.data || []).map(row => String(row.user_id)).filter(Boolean))] });
  }

  isProtocolReady(scope) {
    if (typeof this.isScopeVerified === 'function') return this.isScopeVerified(scope) === true;
    return typeof this.protocolReady === 'function' ? this.protocolReady(scope) === true : this.protocolReady === true;
  }

  async requestPending(scopeInput) {
    let scope;
    try { scope = normalizeE2EScope(scopeInput); }
    catch (error) { return Err(error); }
    if (!scope.eligible) return Err(new Error(scope.reason));
    const result = await this.client.rpc('rim_e2e_request_scope_enable', { p_scope_type: scope.type, p_scope_id: scope.id });
    return result.error ? Err(result.error) : Ok(result.data);
  }

  async activateScope(scopeInput) {
    let scope;
    try { scope = normalizeE2EScope(scopeInput); }
    catch (error) { return Err(error); }
    if (!scope.eligible) return Err(new Error(scope.reason));
    if (!this.isProtocolReady(scope)) return Err(new Error('E2E нельзя активировать до успешного зашифрованного обмена со всеми участниками этой переписки.'));
    if (scope.type === 'direct') return Ok({ mode: 'required', note: 'Секретный личный чат активируется при создании.' });
    const activation = await this.client.rpc('rim_e2e_activate_scope', { p_scope_type: scope.type, p_scope_id: scope.id });
    return activation.error ? Err(activation.error) : Ok(activation.data);
  }

  async requestEnable(scopeInput) {
    let scope;
    try { scope = normalizeE2EScope(scopeInput); }
    catch (error) { return Err(error); }
    if (!scope.eligible) return Err(new Error(scope.reason));
    if (!this.isProtocolReady(scope)) return Err(new Error('E2E нельзя включить до проверки протокола шифрования и успешного зашифрованного обмена со всеми участниками этой переписки.'));
    const pending = await this.requestPending(scopeInput);
    if (!pending.ok) return pending;
    return this.activateScope(scopeInput);
  }
}
