import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
const encoder = new TextEncoder();
const MAX_BODY_BYTES = 512_000;
const MAX_ENVELOPE_CHARS = 400_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonObject = Record<string, unknown>;
function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_request");
  return value as JsonObject;
}
function asString(value: unknown, label: string, max = 256): string {
  if (typeof value !== "string" || !value || value.length > max) throw new Error(`invalid_${label}`);
  return value;
}
function asInt(value: unknown, label: string, min = 0, max = 2_147_483_647): number {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) throw new Error(`invalid_${label}`);
  return Number(value);
}
function asUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new Error(`invalid_${label}`);
  return value;
}
function toBytes(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("invalid_base64");
  const binary = atob(value);
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary);
}
function identityBytes(identity: JsonObject): Uint8Array {
  if (identity.version !== 1) throw new Error("invalid_identity_version");
  const x = toBytes(asString(identity.x25519PublicKey, "identity_key", 64));
  const ed = toBytes(asString(identity.ed25519PublicKey, "identity_key", 64));
  if (x.length !== 32 || ed.length !== 32) throw new Error("invalid_identity_key_length");
  const out = new Uint8Array(67);
  out[0] = 1; out[1] = 1; out.set(x, 2); out[34] = 2; out.set(ed, 35);
  return out;
}
async function identityCommitment(identity: JsonObject): Promise<string> {
  const domain = encoder.encode("signal-protocol-js composite identity v1");
  const tuple = identityBytes(identity);
  const bytes = new Uint8Array(domain.length + tuple.length);
  bytes.set(domain); bytes.set(tuple, domain.length);
  return toBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}
function validatePrekeys(keys: unknown): JsonObject[] {
  if (!Array.isArray(keys) || keys.length > 300) throw new Error("invalid_prekey_batch");
  return keys.map((raw) => {
    const key = asObject(raw);
    const type = asString(key.type, "prekey_type", 32);
    if (!["ecPreKey", "ecSignedPreKey", "kemOneTimePreKey", "kemLastResortPreKey"].includes(type)) throw new Error("invalid_prekey_type");
    asInt(key.keyId, "prekey_id", 0, 2_147_483_647);
    const publicKey = toBytes(asString(key.publicKey, "prekey_public_key", 4096));
    const expectedLength = type.startsWith("kem") ? 1569 : 32;
    if (publicKey.length !== expectedLength) throw new Error("invalid_prekey_public_key_length");
    if (type !== "ecPreKey") {
      const signature = toBytes(asString(key.signature, "prekey_signature", 256));
      if (signature.length !== 64) throw new Error("invalid_prekey_signature_length");
    }
    return key;
  });
}
function mapEnvelope(row: JsonObject) {
  return {
    id: row.id,
    targetUserId: row.target_user_id,
    targetDeviceId: row.target_device_id,
    senderUserId: row.sender_user_id,
    senderDeviceId: row.sender_device_id,
    ciphertext: String(row.ciphertext),
    messageType: row.message_type,
    deliveryClass: row.delivery_class,
    ...(row.content_kind ? { contentKind: row.content_kind } : {}),
    timestamp: Number(row.timestamp_ms),
    ...(row.client_message_id ? { clientMessageId: row.client_message_id } : {}),
    ...(row.operation_epoch_ms ? { operationEpochMilliseconds: Number(row.operation_epoch_ms) } : {}),
    ...(row.recipient_registration_id != null ? { recipientRegistrationId: row.recipient_registration_id } : {}),
    ...(Array.isArray(row.declared_device_ids) ? { declaredDeviceIds: row.declared_device_ids } : {}),
    serverTimestamp: new Date(String(row.created_at)).getTime(),
    cursorCreatedAt: String(row.created_at),
    cursorId: String(row.id),
  };
}
function errorStatus(message: string): number {
  if (["unauthorized", "authentication_required"].includes(message)) return 401;
  if (["owner_only", "owner_mismatch", "device_not_active", "device_not_registered", "requester_device_not_registered", "sender_device_unavailable", "user_blocked", "secure_device_link_required", "secondary_device_requires_link_approval", "shared_e2e_scope_required"].includes(message)) return 403;
  if (["target_device_unavailable", "identity_not_found"].includes(message)) return 404;
  if (message === "prekey_fetch_rate_limited") return 429;
  if (message === "request_too_large") return 413;
  if (["device_limit_reached", "STALE_DEVICE", "DEVICE_SET_MISMATCH", "identity_rotation_conflict", "primary_device_already_registered", "device_slot_revoked_requires_secure_link", "device_slot_unavailable"].includes(message)) return 409;
  if (message.includes("size") || message.startsWith("invalid_") || message.includes("required")) return 400;
  return 500;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthorized" }, 401);
    const { data: auth, error: authError } = await db.auth.getUser(jwt);
    if (authError || !auth.user) return json({ error: "unauthorized" }, 401);
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return json({ error: "request_too_large" }, 413);
    }
    const reader = req.body?.getReader();
    if (!reader) return json({ error: "empty_request_body" }, 400);
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_BODY_BYTES) {
          await reader.cancel("request_too_large");
          return json({ error: "request_too_large" }, 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const rawBytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) { rawBytes.set(chunk, offset); offset += chunk.byteLength; }
    const raw = new TextDecoder().decode(rawBytes);
    const body = asObject(JSON.parse(raw));
    const actor = auth.user.id;
    const action = asString(body.action, "action", 64);

    if (action === "register_device") {
      if (body.userId !== actor) return json({ error: "owner_mismatch" }, 403);
      const device = asObject(body.device);
      const encryptedName = device.encryptedDeviceName instanceof ArrayBuffer
        ? toBase64(new Uint8Array(device.encryptedDeviceName))
        : typeof device.encryptedDeviceName === "string" ? device.encryptedDeviceName : null;
      const { data, error } = await db.rpc("rim_e2e_relay_register_device", {
        p_user_id: actor,
        p_requested_device_id: device.deviceId == null ? null : asInt(device.deviceId, "device_id", 1, 5),
        p_device_type: device.deviceType || "web",
        p_encrypted_device_name: encryptedName,
      });
      if (error) throw new Error(error.message || "device_registration_failed");
      return json({ result: Number(data) });
    }

    if (action === "remove_device") {
      const userId = asString(body.userId, "user_id", 64);
      const deviceId = asInt(body.deviceId, "device_id", 1, 5);
      if (userId !== actor) return json({ error: "owner_mismatch" }, 403);
      const { error } = await db.rpc("rim_e2e_relay_remove_device", { p_user_id: actor, p_device_id: deviceId });
      if (error) throw new Error("device_revocation_failed");
      return json({ result: true });
    }

    if (action === "get_devices" || action === "get_active_devices") {
      const userId = asString(body.userId, "user_id", 64);
      if (userId !== actor) {
        const { data: shared, error: sharedError } = await db.rpc("rim_e2e_users_share_scope", { p_user_a: actor, p_user_b: userId });
        if (sharedError || shared !== true) return json({ error: "shared_e2e_scope_required" }, 403);
      }
      const { data, error } = await db.from("rim_e2e_relay_devices")
        .select("device_id,device_type,encrypted_device_name,registered,enabled,created_at,linked_at,last_seen_at")
        .eq("user_id", userId).eq("status", "active").eq("registered", true).eq("enabled", true).order("device_id");
      if (error) throw new Error("device_lookup_failed");
      if (action === "get_active_devices") return json({ result: (data || []).map(row => ({ userId, deviceId: row.device_id })) });
      return json({ result: (data || []).map(row => ({
        deviceId: row.device_id,
        ...(row.encrypted_device_name ? { encryptedDeviceName: toBytes(row.encrypted_device_name).buffer } : {}),
        deviceType: row.device_type, registered: row.registered, linked: row.device_id !== 1,
        enabled: row.enabled, lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).getTime() : null,
        createdAt: new Date(row.created_at).getTime(), ...(row.linked_at ? { linkedAt: new Date(row.linked_at).getTime() } : {}),
      })) });
    }

    if (action === "provision_identity" || action === "rotate_identity") {
      const userId = asString(body.userId, "user_id", 64);
      if (userId !== actor) return json({ error: "owner_mismatch" }, 403);
      const deviceId = asInt(body.deviceId, "device_id", 1, 5);
      const identityType = body.identityType || "aci";
      if (!["aci", "pni"].includes(String(identityType))) throw new Error("invalid_identity_type");
      const identity = asObject(body.identity);
      const commitment = await identityCommitment(identity);
      const registrationId = asInt(body.registrationId, "registration_id", 0, 65535);
      const rpc = action === "provision_identity" ? "rim_e2e_relay_provision_identity" : "rim_e2e_relay_rotate_identity";
      const args = action === "provision_identity" ? {
        p_user_id: actor, p_device_id: deviceId, p_identity_type: identityType,
        p_identity: identity, p_commitment: commitment, p_registration_id: registrationId,
      } : {
        p_user_id: actor, p_device_id: deviceId, p_identity_type: identityType,
        p_identity: identity, p_new_commitment: commitment,
        p_expected_commitment: typeof body.expectedCurrentCommitment === "string"
          ? toBase64(toBytes(body.expectedCurrentCommitment))
          : toBase64(body.expectedCurrentCommitment instanceof Uint8Array ? body.expectedCurrentCommitment : new Uint8Array(body.expectedCurrentCommitment as ArrayBuffer)),
        p_registration_id: registrationId,
      };
      const { error } = await db.rpc(rpc, args);
      if (error) throw new Error(error.message || "identity_operation_failed");
      return json({ result: true });
    }

    if (action === "get_identity") {
      const userId = asString(body.userId, "user_id", 64);
      const identityType = body.identityType || "aci";
      if (!["aci", "pni"].includes(String(identityType))) throw new Error("invalid_identity_type");
      if (userId !== actor) {
        const { data: shared, error: sharedError } = await db.rpc("rim_e2e_users_share_scope", { p_user_a: actor, p_user_b: userId });
        if (sharedError || shared !== true) return json({ error: "shared_e2e_scope_required" }, 403);
      }
      const { data, error } = await db.from("rim_e2e_relay_identities").select("identity").eq("user_id", userId).eq("identity_type", identityType).maybeSingle();
      if (error) throw new Error("identity_lookup_failed");
      return json({ result: data?.identity || null });
    }

    if (action === "upload_prekeys") {
      const userId = asString(body.userId, "user_id", 64);
      if (userId !== actor) return json({ error: "owner_mismatch" }, 403);
      const keys = validatePrekeys(body.keys);
      const { error } = await db.rpc("rim_e2e_relay_upload_prekeys", {
        p_user_id: actor, p_device_id: asInt(body.deviceId, "device_id", 1, 5),
        p_identity_type: body.identityType || "aci", p_keys: keys,
      });
      if (error) throw new Error(error.message || "prekey_upload_failed");
      return json({ result: true });
    }

    if (action === "fetch_prekey_bundle") {
      const targetUserId = asString(body.userId, "user_id", 64);
      const { data, error } = await db.rpc("rim_e2e_relay_fetch_prekey_bundle", {
        p_requester_user_id: actor,
        p_requester_device_id: asInt(body.requesterDeviceId, "requester_device_id", 1, 5),
        p_target_user_id: targetUserId,
        p_device_id: asInt(body.deviceId, "device_id", 1, 5), p_identity_type: body.identityType || "aci",
      });
      if (error) throw new Error(error.message || "prekey_fetch_failed");
      return json({ result: data || null });
    }

    if (action === "prekey_inventory" || action === "prekey_metadata" || action === "clear_stale_kem") {
      const userId = asString(body.userId, "user_id", 64);
      const deviceId = asInt(body.deviceId, "device_id", 1, 5);
      const identityType = String(body.identityType || "aci");
      if (userId !== actor) return json({ error: "owner_mismatch" }, 403);
      if (action === "clear_stale_kem") {
        if (userId !== actor) return json({ error: "owner_mismatch" }, 403);
        const deleted = await db.from("rim_e2e_relay_prekeys").delete().eq("user_id", actor).eq("device_id", deviceId).eq("identity_type", identityType).eq("key_type", "kemOneTimePreKey").select("id");
        if (deleted.error) throw new Error("stale_kem_cleanup_failed");
        return json({ result: { cleared: deleted.data?.length || 0 } });
      }
      const { data, error } = await db.from("rim_e2e_relay_prekeys").select("key_type,key_id,public_key,created_at,expires_at")
        .eq("user_id", userId).eq("device_id", deviceId).eq("identity_type", identityType).is("consumed_at", null);
      if (error) throw new Error("prekey_inventory_failed");
      const rows = data || [];
      const metadata = (type: string) => {
        const row = rows.filter(item => item.key_type === type && (!item.expires_at || new Date(item.expires_at).getTime() > Date.now())).sort((a,b) => +new Date(b.created_at) - +new Date(a.created_at))[0];
        return row ? { keyId: Number(row.key_id), createdAt: new Date(row.created_at).getTime(), expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : 0, publicKey: row.public_key } : null;
      };
      if (action === "prekey_metadata") return json({ result: metadata(String(body.keyType)) });
      return json({ result: {
        ecSignedPreKey: metadata("ecSignedPreKey"), kemLastResortPreKey: metadata("kemLastResortPreKey"),
        ecOneTimePreKeyCount: rows.filter(row => row.key_type === "ecPreKey").length,
        kemOneTimePreKeyCount: rows.filter(row => row.key_type === "kemOneTimePreKey").length,
      } });
    }

    if (action === "send") {
      const envelope = asObject(body.envelope);
      if (envelope.senderUserId !== actor) return json({ error: "sender_mismatch" }, 403);
      const ciphertext = asString(envelope.ciphertext, "ciphertext", MAX_ENVELOPE_CHARS);
      const { data, error } = await db.rpc("rim_e2e_relay_send_envelope", { p_envelope: { ...envelope, ciphertext } });
      if (error) throw new Error(error.message || "envelope_send_failed");
      return json({ result: data });
    }

    if (action === "pull") {
      const deviceId = asInt(body.deviceId, "device_id", 1, 5);
      const { data: device, error: deviceError } = await db.from("rim_e2e_relay_devices").select("device_id")
        .eq("user_id", actor).eq("device_id", deviceId).eq("status", "active").eq("registered", true).eq("enabled", true).single();
      if (deviceError || !device) return json({ error: "device_not_registered" }, 403);
      let cursorFilter: string | null = null;
      if (body.cursorCreatedAt != null || body.cursorId != null) {
        const cursorCreatedAt = asString(body.cursorCreatedAt, "cursor_created_at", 64);
        const cursorTimestamp = Date.parse(cursorCreatedAt);
        if (!Number.isFinite(cursorTimestamp)) throw new Error("invalid_cursor_created_at");
        const cursorId = asUuid(body.cursorId, "cursor_id");
        const normalizedCursor = new Date(cursorTimestamp).toISOString();
        cursorFilter = `created_at.gt.${normalizedCursor},and(created_at.eq.${normalizedCursor},id.gt.${cursorId})`;
      }
      const now = new Date().toISOString();
      const deliveredCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [expiredCleanup, deliveredCleanup] = await Promise.all([
        db.from("rim_e2e_relay_envelopes").delete().eq("target_user_id", actor).lt("expires_at", now),
        db.from("rim_e2e_relay_envelopes").delete().eq("target_user_id", actor).not("delivered_at", "is", null).lt("delivered_at", deliveredCutoff),
      ]);
      if (expiredCleanup.error || deliveredCleanup.error) throw new Error("mailbox_cleanup_failed");
      let query = db.from("rim_e2e_relay_envelopes").select("*")
        .eq("target_user_id", actor).eq("target_device_id", deviceId).is("delivered_at", null)
        .gt("expires_at", new Date().toISOString());
      if (cursorFilter) query = query.or(cursorFilter);
      const { data, error } = await query.order("created_at").order("id").limit(250);
      if (error) throw new Error("mailbox_pull_failed");
      return json({ result: (data || []).map(mapEnvelope) });
    }

    if (action === "mark_delivered") {
      const { error } = await db.rpc("rim_e2e_relay_mark_delivered", {
        p_user_id: actor, p_device_id: asInt(body.deviceId, "device_id", 1, 5),
        p_envelope_id: asUuid(body.envelopeId, "envelope_id"),
      });
      if (error) throw new Error("envelope_ack_failed");
      return json({ result: true });
    }

    return json({ error: "unsupported_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "relay_request_failed";
    console.error("rim-e2e-relay", message);
    return json({ error: message }, errorStatus(message));
  }
});
