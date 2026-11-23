const encoder = new TextEncoder();

function bytesToBase64(value) {
  if (typeof value === 'string') return value;
  const bytes = value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : ArrayBuffer.isView(value)
      ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
      : null;
  if (!bytes) throw new TypeError('E2E relay expected binary ciphertext.');
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function envelopeFromRow(row) {
  return {
    id: row.id,
    targetUserId: row.target_user_id,
    targetDeviceId: row.target_device_id,
    senderUserId: row.sender_user_id,
    senderDeviceId: row.sender_device_id,
    ciphertext: base64ToBytes(row.ciphertext),
    messageType: row.message_type,
    deliveryClass: row.delivery_class,
    ...(row.content_kind ? { contentKind: row.content_kind } : {}),
    timestamp: Number(row.timestamp_ms),
    ...(row.client_message_id ? { clientMessageId: row.client_message_id } : {}),
    ...(row.operation_epoch_ms ? { operationEpochMilliseconds: Number(row.operation_epoch_ms) } : {}),
    ...(row.recipient_registration_id != null ? { recipientRegistrationId: row.recipient_registration_id } : {}),
    ...(Array.isArray(row.declared_device_ids) ? { declaredDeviceIds: row.declared_device_ids } : {}),
    serverTimestamp: new Date(row.created_at).getTime(),
  };
}

function asError(error, fallback) {
  const message = error?.message || error?.details || error?.hint || fallback;
  return new Error(String(message));
}

/**
 * RIM-owned transport implementing the SDK 14 SignalProtocolRelayServer
 * contract. The Edge Function authenticates every mutation; Realtime only
 * carries ciphertext mailbox rows to the recipient account.
 */
export class SupabaseSignalProtocolRelay {
  constructor({ client, userId, logger = null }) {
    if (!client?.functions?.invoke || !client?.channel || !userId) {
      throw new TypeError('Supabase client, Realtime and authenticated user are required for the RIM E2E relay.');
    }
    this.client = client;
    this.isProductionRelay = true;
    this.userId = String(userId);
    this.logger = logger;
    this.listeners = new Set();
    this.subscriptions = new Map();
    this.publicationLocks = new Map();
    this.deliveryInFlight = new Map();
    this.deliveredEnvelopeIds = new Set();
    this.maxRememberedDeliveries = 10000;
    this._state = Object.freeze({ state: 'stopped', since: Date.now() });
    this._lastDeviceId = null;
  }

  get relayConnectionState() { return this._state; }
  get signalProtocolRelayConnectionState() { return this._state; }

  /** Bind SDK prekey fetches to the authenticated local device, including
   * browsers that are reopening an already registered device. The server
   * independently verifies this device on every prekey request. */
  setCurrentDevice(userId, deviceId) {
    if (String(userId) !== this.userId) throw new Error('Cannot select a device for another RIM account.');
    const normalized = Number(deviceId);
    if (!Number.isInteger(normalized) || normalized < 1 || normalized > 5) {
      throw new Error('RIM E2E device ID must be an integer from 1 to 5.');
    }
    this._lastDeviceId = normalized;
    return normalized;
  }

  #setState(state, reason) {
    this._state = Object.freeze({ state, ...(reason ? { reason } : {}), since: Date.now() });
    for (const listener of this.listeners) {
      try { listener(this._state); } catch (error) { this.logger?.warn?.('e2e.relay.state_listener_failed', error); }
    }
  }

  subscribeRelayConnectionState(listener) {
    if (typeof listener !== 'function') throw new TypeError('Connection-state listener must be a function.');
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  subscribeSignalProtocolRelayConnectionState(listener) { return this.subscribeRelayConnectionState(listener); }

  async #withPublicationLock(deviceId, identityType, operation) {
    const key = `${this.userId}:${Number(deviceId)}:${identityType || 'aci'}`;
    const lockName = `rim-e2e-prekey-publication:${key}`;
    const lockManager = globalThis.navigator?.locks;
    if (typeof lockManager?.request === 'function') {
      return lockManager.request(lockName, { mode: 'exclusive' }, operation);
    }
    const previous = this.publicationLocks.get(key) || Promise.resolve();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const tail = previous.catch(() => {}).then(() => gate);
    this.publicationLocks.set(key, tail);
    await previous.catch(() => {});
    try { return await operation(); }
    finally {
      release();
      if (this.publicationLocks.get(key) === tail) this.publicationLocks.delete(key);
    }
  }

  async #deliverOnce(envelope, onEnvelope) {
    const id = String(envelope?.id || '');
    if (!id) return onEnvelope(envelope);
    if (this.deliveredEnvelopeIds.has(id)) return false;
    const pending = this.deliveryInFlight.get(id);
    if (pending) return pending;

    const operation = Promise.resolve().then(() => onEnvelope(envelope)).then(result => {
      this.deliveredEnvelopeIds.add(id);
      if (this.deliveredEnvelopeIds.size > this.maxRememberedDeliveries) {
        const oldest = this.deliveredEnvelopeIds.values().next().value;
        this.deliveredEnvelopeIds.delete(oldest);
      }
      return result;
    }).finally(() => {
      if (this.deliveryInFlight.get(id) === operation) this.deliveryInFlight.delete(id);
    });
    this.deliveryInFlight.set(id, operation);
    return operation;
  }

  async #invoke(action, payload = {}) {
    const { data, error } = await this.client.functions.invoke('rim-e2e-relay', { body: { action, ...payload } });
    if (error) {
      let details = error.message || `RIM E2E relay action failed: ${action}`;
      try {
        const response = error.context;
        if (response && typeof response.json === 'function') {
          const parsed = await response.json();
          details = parsed?.error || details;
        }
      } catch { /* retain the SDK error message */ }
      throw new Error(String(details));
    }
    if (data?.error) throw new Error(String(data.error));
    return data?.result;
  }

  async send(envelope) {
    if (String(envelope.senderUserId) !== this.userId) throw new Error('Relay sender does not match the authenticated RIM account.');
    const normalized = {
      ...envelope,
      ciphertext: bytesToBase64(envelope.ciphertext),
      ...(envelope.declaredDeviceIds ? { declaredDeviceIds: [...envelope.declaredDeviceIds] } : {}),
    };
    return this.#invoke('send', { envelope: normalized });
  }

  subscribe(userId, deviceId, onEnvelope, options = {}) {
    const account = String(userId);
    const device = Number(deviceId);
    if (account !== this.userId || !Number.isInteger(device) || device < 1 || device > 5) {
      throw new Error('Relay subscription identity does not match the authenticated RIM device.');
    }
    if (typeof onEnvelope !== 'function') throw new TypeError('onEnvelope callback is required.');
    const key = `${account}:${device}`;
    this.subscriptions.get(key)?.unsubscribe();
    this._lastDeviceId = device;
    this.#setState('connecting');
    let active = true;
    let pullPromise = null;
    const startMailboxRecovery = () => {
      if (!active || pullPromise) return;
      const task = this.#pullPending(device, onEnvelope, options, () => active);
      const tracked = task.finally(() => {
        if (pullPromise === tracked) pullPromise = null;
      });
      pullPromise = tracked;
    };
    const channel = this.client.channel(`rim-e2e-mailbox:${account}:${device}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'rim_e2e_relay_envelopes',
        filter: `target_user_id=eq.${account}`,
      }, async payload => {
        if (!active) return;
        const row = payload?.new;
        if (!row || Number(row.target_device_id) !== device || row.delivered_at) return;
        if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return;
        try {
          options.onBatchStart?.();
          await this.#deliverOnce(envelopeFromRow(row), onEnvelope);
          options.onBatchEnd?.();
        } catch (error) {
          this.logger?.warn?.('e2e.relay.realtime_delivery_failed', { message: error?.message || String(error) });
        }
      })
      .subscribe(status => {
        if (!active) return;
        if (status === 'SUBSCRIBED') {
          this.#setState('connected');
          startMailboxRecovery();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.#setState('reconnecting', status === 'TIMED_OUT' ? 'handshake' : 'error');
        } else if (status === 'CLOSED') {
          this.#setState('reconnecting', 'closed');
        }
      });
    const unsubscribe = () => {
      if (!active) return;
      active = false;
      try { this.client.removeChannel(channel); } catch { /* best effort */ }
      if (this.subscriptions.get(key)?.unsubscribe === unsubscribe) this.subscriptions.delete(key);
      this.#setState('stopped');
    };
    this.subscriptions.set(key, { channel, unsubscribe });
    return unsubscribe;
  }

  async #pullPending(deviceId, onEnvelope, options, isActive = () => true) {
    try {
      let cursorCreatedAt;
      let cursorId;
      let delivered = 0;
      for (let page = 0; page < 20; page += 1) {
        if (!isActive()) return;
        const rows = await this.#invoke('pull', { deviceId, ...(cursorCreatedAt ? { cursorCreatedAt, cursorId } : {}) });
        if (!isActive()) return;
        if (!Array.isArray(rows) || !rows.length) break;
        if (!delivered) options.onBatchStart?.();
        for (const envelope of rows) {
          if (!isActive()) return;
          const { cursorCreatedAt: nextCreatedAt, cursorId: nextId, ...sdkEnvelope } = envelope;
          const normalized = typeof sdkEnvelope?.ciphertext === 'string'
            ? { ...sdkEnvelope, ciphertext: base64ToBytes(sdkEnvelope.ciphertext) }
            : sdkEnvelope;
          await this.#deliverOnce(normalized, onEnvelope);
          if (!isActive()) return;
          cursorCreatedAt = nextCreatedAt;
          cursorId = nextId;
          delivered += 1;
        }
        if (rows.length < 250) break;
      }
      if (delivered && isActive()) options.onBatchEnd?.();
    } catch (error) {
      this.logger?.warn?.('e2e.relay.mailbox_recovery_failed', { message: error?.message || String(error) });
    }
  }

  async touchScope(scopeType, scopeId) {
    const { data, error } = await this.client.rpc('rim_e2e_touch_scope', { p_scope_type: String(scopeType || ''), p_scope_id: String(scopeId || '') });
    if (error) throw error;
    return data;
  }

  async markDelivered(envelopeId) {
    if (!this._lastDeviceId) throw new Error('No active E2E mailbox subscription.');
    await this.#invoke('mark_delivered', { deviceId: this._lastDeviceId, envelopeId: String(envelopeId) });
  }

  async getDevices(userId) { return this.#invoke('get_devices', { userId: String(userId) }); }
  async getActiveDevices(userId) { return this.#invoke('get_active_devices', { userId: String(userId) }); }

  async registerDevice(userId, device) {
    if (String(userId) !== this.userId) throw new Error('Cannot register a device for another RIM account.');
    const normalized = { ...device };
    if (device?.encryptedDeviceName) normalized.encryptedDeviceName = bytesToBase64(device.encryptedDeviceName);
    const deviceId = await this.#invoke('register_device', { userId: this.userId, device: normalized });
    this._lastDeviceId = Number(deviceId);
    return Number(deviceId);
  }

  async removeDevice(userId, deviceId) {
    if (String(userId) !== this.userId) throw new Error('Cannot remove a device from another RIM account.');
    await this.#invoke('remove_device', { userId: this.userId, deviceId: Number(deviceId) });
  }

  async provisionIdentityKey(request) {
    if (String(request.userId) !== this.userId) throw new Error('Identity owner mismatch.');
    await this.#invoke('provision_identity', { ...request, userId: this.userId });
  }

  async rotateIdentityKey(request) {
    if (String(request.userId) !== this.userId) throw new Error('Identity owner mismatch.');
    await this.#invoke('rotate_identity', {
      ...request,
      userId: this.userId,
      expectedCurrentCommitment: bytesToBase64(request.expectedCurrentCommitment),
    });
  }

  async getIdentityKey(userId, identityType = 'aci') {
    return this.#invoke('get_identity', { userId: String(userId), identityType });
  }

  async #uploadPreKeysUnlocked(deviceId, keys, identityType) {
    await this.#invoke('upload_prekeys', { userId: this.userId, deviceId: Number(deviceId), keys, identityType });
  }

  async uploadPreKeys(userId, deviceId, keys, identityType = 'aci') {
    if (String(userId) !== this.userId) throw new Error('Prekey owner mismatch.');
    return this.#withPublicationLock(deviceId, identityType, () => this.#uploadPreKeysUnlocked(deviceId, keys, identityType));
  }

  async fetchPreKeyBundle(userId, deviceId, _fetcherUserId, identityType = 'aci') {
    if (!this._lastDeviceId) throw new Error('Register this E2E device before requesting a peer prekey bundle.');
    return this.#invoke('fetch_prekey_bundle', {
      userId: String(userId), deviceId: Number(deviceId),
      requesterDeviceId: this._lastDeviceId, identityType
    });
  }

  async getPreKeyCount(userId, deviceId, type, identityType = 'aci') {
    if (String(userId) !== this.userId) throw new Error('Prekey inventory is private to the account owner.');
    const inventory = await this.getPreKeyInventory(userId, deviceId, identityType);
    return type === 'ec' ? inventory.ecOneTimePreKeyCount : inventory.kemOneTimePreKeyCount;
  }

  async getPreKeyInventory(userId, deviceId, identityType = 'aci') {
    if (String(userId) !== this.userId) throw new Error('Prekey inventory is private to the account owner.');
    return this.#invoke('prekey_inventory', { userId: this.userId, deviceId: Number(deviceId), identityType });
  }

  async clearStaleKemPreKeys(userId, deviceId, identityType = 'aci') {
    if (String(userId) !== this.userId) throw new Error('Prekey owner mismatch.');
    return this.#withPublicationLock(deviceId, identityType, () => this.#invoke('clear_stale_kem', { userId: this.userId, deviceId: Number(deviceId), identityType }));
  }

  async publishPlannedPreKeys(userId, deviceId, plan, identityType = 'aci') {
    if (String(userId) !== this.userId) throw new Error('Prekey owner mismatch.');
    if (typeof plan !== 'function') throw new TypeError('Prekey publication plan must be a function.');
    return this.#withPublicationLock(deviceId, identityType, async () => {
      const inventory = await this.#invoke('prekey_inventory', { userId: this.userId, deviceId: Number(deviceId), identityType });
      const uploads = await plan(inventory);
      if (uploads?.length) await this.#uploadPreKeysUnlocked(deviceId, uploads, identityType);
    });
  }

  async getEcSignedPreKeyMetadata(userId, deviceId, identityType = 'aci') {
    if (String(userId) !== this.userId) throw new Error('Prekey metadata is private to the account owner.');
    return this.#invoke('prekey_metadata', { userId: this.userId, deviceId: Number(deviceId), identityType, keyType: 'ecSignedPreKey' });
  }

  async getKemLastResortPreKeyMetadata(userId, deviceId, identityType = 'aci') {
    if (String(userId) !== this.userId) throw new Error('Prekey metadata is private to the account owner.');
    return this.#invoke('prekey_metadata', { userId: this.userId, deviceId: Number(deviceId), identityType, keyType: 'kemLastResortPreKey' });
  }

  async dispose() {
    for (const entry of this.subscriptions.values()) entry.unsubscribe();
    this.subscriptions.clear();
    this.deliveryInFlight.clear();
    this.deliveredEnvelopeIds.clear();
    this.publicationLocks.clear();
    this.listeners.clear();
    this.#setState('stopped');
  }
}

export const __e2eRelayInternals = Object.freeze({ bytesToBase64, base64ToBytes, envelopeFromRow });
