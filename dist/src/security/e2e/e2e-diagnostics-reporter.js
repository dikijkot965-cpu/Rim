/**
 * Automatic, privacy-preserving E2E diagnostics. Only operational metadata is
 * sent to Supabase: never plaintext, ciphertext, private keys, tokens or QR data.
 */
const EVENT_MAP = Object.freeze({
  runtime_started_for_protected_scope: 'runtime_start',
  runtime_started_in_lab: 'runtime_start',
  runtime_start_failed: 'runtime_error',
  peer_exchange_verified: 'runtime_ready',
  peer_exchange_verified_in_lab: 'runtime_ready',
  peer_exchange_failed: 'runtime_error',
  peer_exchange_failed_in_lab: 'runtime_error',
  message_encrypted_sent: 'message_send',
  lab_encrypted_test_sent: 'message_send',
  message_decrypted: 'message_received',
  message_decrypt_unrecognized: 'message_decrypt_error',
  runtime_signed_out: 'relay_state'
});
const STATUS_MAP = Object.freeze({ success: 'ok', info: 'ok', warning: 'warning', error: 'error', connected: 'connected', disconnected: 'disconnected' });

export class E2EDiagnosticsReporter {
  constructor({ client, getUser, logger = null, protocol = 'OPEN-E2EE-SP1', now = () => Date.now() } = {}) {
    this.client = client;
    this.getUser = getUser;
    this.logger = logger;
    this.protocol = protocol;
    this.now = now;
    this.lastByKey = new Map();
    this.pending = new Set();
  }

  record(event, { status = 'info', code = null, conversationId = null, deviceId = 1, latencyMs = null, metadata = {} } = {}) {
    const userId = String(this.getUser?.()?.id || '');
    if (!userId || !this.client?.from) return Promise.resolve(false);
    const safeEvent = EVENT_MAP[String(event || '')] || (['runtime_start', 'runtime_ready', 'runtime_error', 'message_send', 'message_received', 'message_decrypt_error', 'device_register', 'relay_state', 'device_link', 'device_sync'].includes(String(event)) ? String(event) : 'runtime_error');
    const safeStatus = STATUS_MAP[String(status)] || 'ok';
    const key = `${userId}:${safeEvent}:${safeStatus}:${String(code || '')}`;
    const at = this.now();
    if (at - (this.lastByKey.get(key) || 0) < 1500) return Promise.resolve(false);
    this.lastByKey.set(key, at);
    const safeMetadata = {};
    for (const [name, value] of Object.entries(metadata || {}).slice(0, 10)) {
      if (!/^[a-zA-Z0-9_.-]{1,48}$/.test(name)) continue;
      if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) {
        const text = typeof value === 'string' ? value.slice(0, 100) : value;
        if (!/(body|text|cipher|secret|private|token|key|qr|envelope|payload)/i.test(name)) safeMetadata[name] = text;
      }
    }
    const row = {
      user_id: userId,
      conversation_id: conversationId ? String(conversationId) : null,
      device_id: Number.isInteger(Number(deviceId)) && Number(deviceId) >= 1 && Number(deviceId) <= 5 ? Number(deviceId) : 1,
      event: safeEvent,
      status: safeStatus,
      code: code ? String(code).slice(0, 80) : null,
      latency_ms: Number.isFinite(Number(latencyMs)) ? Math.max(0, Math.min(600000, Math.trunc(Number(latencyMs)))) : null,
      protocol: this.protocol,
      metadata: safeMetadata
    };
    const task = Promise.resolve(this.client.from('rim_e2e_diagnostics').insert(row))
      .then(({ error }) => {
        if (error) throw error;
        return true;
      })
      .catch(error => {
        this.logger?.warn?.('e2e.diagnostics.persist_failed', { message: String(error?.message || error).slice(0, 180) });
        return false;
      })
      .finally(() => this.pending.delete(task));
    this.pending.add(task);
    return task;
  }

  async listRecent({ limit = 100 } = {}) {
    if (!this.client?.from) throw new Error('Supabase diagnostics client is unavailable.');
    const boundedLimit = Math.max(1, Math.min(250, Math.trunc(Number(limit) || 100)));
    const { data, error } = await this.client.from('rim_e2e_diagnostics')
      .select('id,user_id,conversation_id,device_id,event,status,code,latency_ms,protocol,metadata,created_at')
      .order('created_at', { ascending: false }).limit(boundedLimit);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async flush() { await Promise.allSettled([...this.pending]); }
}
