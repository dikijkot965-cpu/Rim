import { RECOVERY_WORDS } from "./recovery-words.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Legacy hashes remain verifiable with the original HKDF root. New credentials use an independent pepper held inside Supabase Vault.
const LEGACY_PEPPER = SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "Pragma": "no-cache"
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const encoder = new TextEncoder();
const recoveryWordIndex = new Map(RECOVERY_WORDS.map((word, index) => [word, index]));
const recoveryWords12 = RECOVERY_WORDS.slice(0, 64).flatMap(prefix => RECOVERY_WORDS.slice(64, 96).map(suffix => `${prefix}-${suffix}`));
const recoveryWord12Index = new Map(recoveryWords12.map((word, index) => [word, index]));
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
const makeCode = () => {
  const raw = crypto.getRandomValues(new Uint8Array(16));
  return hex(raw).toUpperCase().match(/.{1,4}/g)!.join("-");
};
async function legacyHmacText(value: string, legacyCode = false) {
  const baseKey = await crypto.subtle.importKey("raw", encoder.encode(LEGACY_PEPPER), "HKDF", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({
    name: "HKDF", hash: "SHA-256",
    salt: encoder.encode(legacyCode ? "RIM/account-security/v1" : "RIM/account-security/v2"),
    info: encoder.encode(legacyCode ? "recovery-code-hmac" : "recovery-credential-hmac")
  }, baseKey, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}
const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-F0-9]/g, "");
const legacyCodeDigest = (code: string) => legacyHmacText(normalizeCode(code), true);
const legacyPhraseDigest = (phrase: string) => legacyHmacText(phrase.trim().toLowerCase().replace(/\s+/g, " "));
async function hashV3(value: string, context: "phrase-v3" | "code-v3" | "rate-v3") {
  const { data, error } = await admin.rpc("rim_hash_recovery_credential", { p_value: value, p_context: context });
  if (error || typeof data !== "string" || !/^[0-9a-f]{64}$/.test(data)) throw new Error("recovery_hash_unavailable");
  return data;
}
const codeDigest = (code: string) => hashV3(normalizeCode(code), "code-v3");
const phraseDigest = (phrase: string) => hashV3(phrase.trim().toLowerCase().replace(/\s+/g, " "), "phrase-v3");
async function validRecoveryPhrase(phrase: string) {
  const words = phrase.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 24 && words.every(word => recoveryWordIndex.has(word))) {
    const bytes = words.map(word => recoveryWordIndex.get(word)!);
    const entropy = new Uint8Array(bytes.slice(0, 23));
    const checksum = new Uint8Array(await crypto.subtle.digest("SHA-256", entropy));
    return checksum[0] === bytes[23];
  }
  if (words.length === 12 && words.every(word => recoveryWord12Index.has(word))) {
    const packed = words.map(word => recoveryWord12Index.get(word)!.toString(2).padStart(11, "0")).join("");
    const entropyBits = packed.slice(0, 128);
    const entropy = new Uint8Array(16);
    for (let i = 0; i < 16; i += 1) entropy[i] = parseInt(entropyBits.slice(i * 8, i * 8 + 8), 2);
    const checksum = new Uint8Array(await crypto.subtle.digest("SHA-256", entropy));
    return packed.slice(128) === checksum[0].toString(2).padStart(8, "0").slice(0, 4);
  }
  return false;
}
function bearer(request: Request) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}
async function authenticatedUser(request: Request) {
  const token = bearer(request);
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user || null;
}
function clientIp(request: Request) {
  // Cloudflare overwrites this header at the edge. Do not trust X-Forwarded-For
  // or X-Real-IP supplied by an arbitrary caller: both can be spoofed.
  return request.headers.get("cf-connecting-ip")?.trim() || "";
}
async function allowRate(request: Request, action: string, key: string, limit: number, windowSeconds: number) {
  const keyHash = await hashV3(`rate:${action}:${key}`, "rate-v3");
  const { data, error } = await admin.rpc("rim_check_recovery_rate_limit", {
    p_key_hash: keyHash, p_action: action, p_limit: limit, p_window_seconds: windowSeconds
  });
  if (error) throw new Error("recovery_rate_limit_unavailable");
  return data === true;
}
function decodeJwtClaims(token: string) {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
  } catch { return null; }
}
function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function deriveSeedLoginPassword(phrase: string, saltText: string) {
  const normalized = saltText.replace(/-/g, "+").replace(/_/g, "/");
  const salt = new Uint8Array([...atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))].map(char => char.charCodeAt(0)));
  const material = await crypto.subtle.importKey("raw", encoder.encode(phrase), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 600000 }, material, 256
  ));
  return "RIM-SEED-LOGIN-V1-" + base64Url(bits);
}
function randomSalt() { return base64Url(crypto.getRandomValues(new Uint8Array(16))); }
async function createRecoverySession(userId: string, credentialHash: string, credentialType: "code" | "phrase", hashVersion: number) {
  const { data: userResult, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError || !userResult.user?.email) return null;
  // A magic-link hash is returned directly to the authenticated recovery flow;
  // no external provider account or email inbox is required at redemption time.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: userResult.user.email });
  if (linkError || !link?.properties?.hashed_token) return null;
  const rpc = credentialType === "phrase" ? "rim_consume_recovery_phrase_v2" : "rim_consume_recovery_code_v2";
  const args = credentialType === "phrase"
    ? { p_phrase_hash: credentialHash, p_hash_version: hashVersion }
    : { p_code_hash: credentialHash, p_hash_version: hashVersion };
  const { data: consumedUserId, error: consumeError } = await admin.rpc(rpc, args);
  if (consumeError || consumedUserId !== userId) return null;
  return link.properties.hashed_token as string;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > 8192) return json({ error: "request_too_large" }, 413);

  try {
    const rawBody = await request.text();
    if (encoder.encode(rawBody).byteLength > 8192) return json({ error: "request_too_large" }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(rawBody); }
    catch { return json({ error: "invalid_json" }, 400); }
    const action = String(body.action || "");

    if (action === "status") {
      const user = await authenticatedUser(request);
      if (!user) return json({ error: "unauthorized" }, 401);
      const providers = Array.isArray(user.app_metadata?.providers) ? user.app_metadata.providers.map(String) : [];
      const identityProviders = Array.isArray(user.identities) ? user.identities.map(identity => String(identity.provider || "")).filter(Boolean) : [];
      const allProviders = [...new Set([...providers, ...identityProviders])];
      const [{ data: phrase }, { data: codes }, { data: state }, { data: passwordConfigured, error: passwordStatusError }, { data: seedOnly }, { data: seedOnlyReady }] = await Promise.all([
        admin.from("rim_recovery_codes").select("id").eq("user_id", user.id).eq("credential_type", "phrase").is("used_at", null).limit(1).maybeSingle(),
        admin.from("rim_recovery_codes").select("id").eq("user_id", user.id).eq("credential_type", "code").is("used_at", null).limit(1).maybeSingle(),
        admin.from("rim_account_security_state").select("onboarding_shown_at,recovery_phrase_created_at").eq("user_id", user.id).maybeSingle(),
        admin.rpc("rim_account_has_password", { p_user_id: user.id }),
        admin.rpc("rim_seed_only_status", { p_user_id: user.id }),
        admin.rpc("rim_seed_only_readiness")
      ]);
      if (passwordStatusError) throw new Error("password_status_unavailable");
      const createdAt = Date.parse(user.created_at || "");
      const onboardingAfter = Date.parse("2026-11-20T13:00:00Z");
      const isNewAccount = Number.isFinite(createdAt) && createdAt >= onboardingAfter;
      return json({
        providers: allProviders,
        has_password: passwordConfigured === true,
        has_recovery_phrase: !!phrase,
        has_recovery_codes: !!codes,
        seed_only_enabled: seedOnly === true,
        seed_only_ready: seedOnlyReady === true,
        onboarding_required: isNewAccount && !state?.onboarding_shown_at,
        recovery_phrase_created_at: state?.recovery_phrase_created_at || null
      });
    }

    if (action === "mark_onboarding_seen") {
      const user = await authenticatedUser(request);
      if (!user) return json({ error: "unauthorized" }, 401);
      const { error } = await admin.from("rim_account_security_state").upsert({
        user_id: user.id, onboarding_shown_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });
      if (error) throw new Error("security_state_update_failed");
      return json({ ok: true });
    }

    if (action === "issue") {
      const user = await authenticatedUser(request);
      if (!user) return json({ error: "unauthorized" }, 401);
      if (!await allowRate(request, "issue_codes", user.id, 3, 3600)) return json({ error: "rate_limited" }, 429);
      const codes = Array.from({ length: 10 }, makeCode);
      const hashes = await Promise.all(codes.map(codeDigest));
      const { error } = await admin.rpc("rim_rotate_recovery_codes", { p_user_id: user.id, p_code_hashes: hashes });
      if (error) throw new Error("recovery_code_rotation_failed");
      return json({ codes, count: codes.length });
    }

    if (action === "save_phrase") {
      const user = await authenticatedUser(request);
      if (!user) return json({ error: "unauthorized" }, 401);
      if (!await allowRate(request, "issue_phrase", user.id, 3, 3600)) return json({ error: "rate_limited" }, 429);
      const phrase = String(body.phrase || "").trim().toLowerCase().replace(/\s+/g, " ");
      if (phrase.length > 512) return json({ error: "invalid_recovery_phrase" }, 400);
      if (!await validRecoveryPhrase(phrase)) return json({ error: "invalid_recovery_phrase" }, 400);
      const hash = await phraseDigest(phrase);
      const { error } = await admin.rpc("rim_rotate_recovery_phrase", { p_user_id: user.id, p_phrase_hash: hash });
      if (error) throw new Error("recovery_phrase_save_failed");
      await admin.from("rim_account_security_state").upsert({
        user_id: user.id, onboarding_shown_at: new Date().toISOString(), recovery_phrase_created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });
      return json({ saved: true });
    }

    if (action === "seed_only_enable") {
      const user = await authenticatedUser(request);
      if (!user) return json({ error: "unauthorized" }, 401);
      const { data: hookReady, error: hookReadyError } = await admin.rpc("rim_seed_only_readiness");
      if (hookReadyError || hookReady !== true) return json({ error: "seed_auth_hook_not_configured" }, 503);
      if (!await allowRate(request, "seed_enable", user.id, 3, 3600)) return json({ error: "rate_limited" }, 429);
      const phrase = String(body.phrase || "").trim().toLowerCase().replace(/\s+/g, " ");
      if (phrase.length > 512 || !await validRecoveryPhrase(phrase)) return json({ error: "invalid_recovery_phrase" }, 400);
      const claims = decodeJwtClaims(bearer(request));
      const sessionId = String(claims?.session_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return json({ error: "session_context_unavailable" }, 401);
      let phraseHash = await phraseDigest(phrase);
      let { data: ownedPhrase, error: phraseLookupError } = await admin.from("rim_recovery_codes")
        .select("id").eq("user_id", user.id).eq("credential_type", "phrase")
        .eq("hash_version", 3).eq("code_hash", phraseHash).is("used_at", null).maybeSingle();
      if (!ownedPhrase) {
        phraseHash = await legacyPhraseDigest(phrase);
        const legacy = await admin.from("rim_recovery_codes").select("id").eq("user_id", user.id)
          .eq("credential_type", "phrase").eq("hash_version", 1).eq("code_hash", phraseHash)
          .is("used_at", null).maybeSingle();
        ownedPhrase = legacy.data; phraseLookupError = legacy.error;
      }
      if (phraseLookupError || !ownedPhrase) return json({ error: "phrase_does_not_match_account" }, 401);
      const seedCredentialHash = await phraseDigest(phrase);
      const salt = randomSalt();
      const derivedPassword = await deriveSeedLoginPassword(phrase, salt);
      const { data: begun, error: beginError } = await admin.rpc("rim_seed_only_begin", {
        p_user_id: user.id, p_phrase_hash: seedCredentialHash, p_password_salt: salt, p_session_id: sessionId
      });
      if (beginError || begun !== true) throw new Error("seed_only_begin_failed");
      const { error: passwordError } = await admin.auth.admin.updateUserById(user.id, { password: derivedPassword });
      if (passwordError) {
        await admin.rpc("rim_seed_only_cancel_pending", { p_user_id: user.id });
        throw new Error("seed_password_rotation_failed");
      }
      const { data: activated, error: activateError } = await admin.rpc("rim_seed_only_activate", { p_user_id: user.id });
      if (activateError || activated !== true) throw new Error("seed_only_activation_pending_retry_required");
      return json({ enabled: true, session_revocation: "other_sessions_revoked", reauthentication_may_be_required: true });
    }

    if (action === "seed_login") {
      const { data: hookReady, error: hookReadyError } = await admin.rpc("rim_seed_only_readiness");
      if (hookReadyError || hookReady !== true) return json({ error: "seed_auth_hook_not_configured" }, 503);
      const phrase = String(body.phrase || "").trim().toLowerCase().replace(/\s+/g, " ");
      if (phrase.length > 512 || !await validRecoveryPhrase(phrase)) return json({ error: "invalid_recovery_phrase" }, 400);
      const ip = clientIp(request);
      if (!ip || !await allowRate(request, "seed_login_ip", ip, 8, 900)) return json({ error: "rate_limited" }, 429);
      const phraseHash = await phraseDigest(phrase);
      if (!await allowRate(request, "seed_login_phrase", phraseHash, 5, 3600)) return json({ error: "rate_limited" }, 429);
      const { data: matches, error: lookupError } = await admin.rpc("rim_seed_only_lookup", { p_phrase_hash: phraseHash });
      const account = Array.isArray(matches) ? matches[0] : null;
      if (lookupError || !account?.user_id || !account?.password_salt) return json({ error: "invalid_or_unavailable_seed" }, 401);
      if (!await allowRate(request, "seed_login_user", account.user_id, 8, 900)) return json({ error: "rate_limited" }, 429);
      if (!SUPABASE_ANON_KEY) return json({ error: "seed_auth_not_configured" }, 503);
      const { data: userResult, error: userError } = await admin.auth.admin.getUserById(account.user_id);
      const email = userResult?.user?.email;
      if (userError || !email) return json({ error: "invalid_or_unavailable_seed" }, 401);
      const password = await deriveSeedLoginPassword(phrase, account.password_salt);
      const publicClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: signIn, error: signInError } = await publicClient.auth.signInWithPassword({ email, password });
      if (signInError || !signIn?.session) return json({ error: "seed_auth_failed" }, 401);
      const sessionId = String(decodeJwtClaims(signIn.session.access_token)?.session_id || "");
      if (!sessionId) return json({ error: "seed_session_unavailable" }, 503);
      const { data: authorized, error: sessionCheckError } = await admin.rpc("rim_seed_only_session_status", {
        p_user_id: account.user_id, p_session_id: sessionId
      });
      if (sessionCheckError || authorized !== true) return json({ error: "seed_auth_hook_not_configured" }, 503);
      return json({ access_token: signIn.session.access_token, refresh_token: signIn.session.refresh_token, expires_in: signIn.session.expires_in });
    }

    if (action === "seed_only_disable") {
      const user = await authenticatedUser(request);
      if (!user) return json({ error: "unauthorized" }, 401);
      const phrase = String(body.phrase || "").trim().toLowerCase().replace(/\s+/g, " ");
      const newPassword = String(body.new_password || "");
      if (!await validRecoveryPhrase(phrase)) return json({ error: "invalid_recovery_phrase" }, 400);
      if (newPassword.length < 12 || newPassword.length > 128) return json({ error: "weak_password" }, 400);
      const phraseHash = await phraseDigest(phrase);
      const { data: matches, error: lookupError } = await admin.rpc("rim_seed_only_lookup", { p_phrase_hash: phraseHash });
      const account = Array.isArray(matches) ? matches[0] : null;
      if (lookupError || account?.user_id !== user.id) return json({ error: "invalid_or_unavailable_seed" }, 401);
      const { error: passwordError } = await admin.auth.admin.updateUserById(user.id, { password: newPassword });
      if (passwordError) throw new Error("seed_only_disable_password_update_failed");
      const { error: disableError } = await admin.rpc("rim_seed_only_disable", { p_user_id: user.id });
      if (disableError) throw new Error("seed_only_disable_failed");
      return json({ disabled: true });
    }

    if (action === "redeem") {
      const code = String(body.code || "").trim();
      if (code.length < 20 || code.length > 64 || !/^[A-Fa-f0-9-]+$/.test(code)) return json({ error: "invalid_recovery_code" }, 400);
      const ip = clientIp(request);
      if (!ip) return json({ error: "rate_limit_identity_unavailable" }, 503);
      if (!await allowRate(request, "redeem_code", ip, 8, 900)) return json({ error: "rate_limited" }, 429);
      let codeHash = await codeDigest(code);
      let hashVersion = 3;
      let { data: candidate, error: lookupError } = await admin.from("rim_recovery_codes")
        .select("user_id").eq("code_hash", codeHash).eq("credential_type", "code").eq("hash_version", 3).is("used_at", null).maybeSingle();
      if (!candidate?.user_id) {
        codeHash = await legacyCodeDigest(code);
        hashVersion = 1;
        const legacy = await admin.from("rim_recovery_codes").select("user_id")
          .eq("code_hash", codeHash).eq("credential_type", "code").eq("hash_version", 1).is("used_at", null).maybeSingle();
        candidate = legacy.data; lookupError = legacy.error;
      }
      if (lookupError || !candidate?.user_id) return json({ error: "invalid_or_used_recovery_code" }, 401);
      const tokenHash = await createRecoverySession(candidate.user_id, codeHash, "code", hashVersion);
      if (!tokenHash) return json({ error: "invalid_or_used_recovery_code" }, 401);
      return json({ token_hash: tokenHash });
    }

    if (action === "redeem_phrase") {
      const phrase = String(body.phrase || "").trim().toLowerCase().replace(/\s+/g, " ");
      if (phrase.length > 512) return json({ error: "invalid_recovery_phrase" }, 400);
      if (!await validRecoveryPhrase(phrase)) return json({ error: "invalid_recovery_phrase" }, 400);
      const ip = clientIp(request);
      if (!ip) return json({ error: "rate_limit_identity_unavailable" }, 503);
      if (!await allowRate(request, "redeem_phrase", ip, 8, 900)) return json({ error: "rate_limited" }, 429);
      let phraseHash = await phraseDigest(phrase);
      let hashVersion = 3;
      let { data: candidate, error: lookupError } = await admin.from("rim_recovery_codes")
        .select("user_id").eq("code_hash", phraseHash).eq("credential_type", "phrase").eq("hash_version", 3).is("used_at", null).maybeSingle();
      if (!candidate?.user_id) {
        phraseHash = await legacyPhraseDigest(phrase);
        hashVersion = 1;
        const legacy = await admin.from("rim_recovery_codes").select("user_id")
          .eq("code_hash", phraseHash).eq("credential_type", "phrase").eq("hash_version", 1).is("used_at", null).maybeSingle();
        candidate = legacy.data; lookupError = legacy.error;
      }
      if (lookupError || !candidate?.user_id) return json({ error: "invalid_or_used_recovery_phrase" }, 401);
      const tokenHash = await createRecoverySession(candidate.user_id, phraseHash, "phrase", hashVersion);
      if (!tokenHash) return json({ error: "invalid_or_used_recovery_phrase" }, 401);
      return json({ token_hash: tokenHash });
    }

    return json({ error: "unsupported_action" }, 400);
  } catch (error) {
    console.error("RIM account security request failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "account_security_failed" }, 500);
  }
});
