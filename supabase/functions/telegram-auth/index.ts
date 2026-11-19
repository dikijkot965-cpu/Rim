import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_CLIENT_ID = Deno.env.get("TELEGRAM_CLIENT_ID") || "9041438103";
const TELEGRAM_CLIENT_SECRET = Deno.env.get("TELEGRAM_CLIENT_SECRET") || "";
const TELEGRAM_REDIRECT_URI = Deno.env.get("TELEGRAM_REDIRECT_URI") || "";
const ISSUER = "https://oauth.telegram.org";
const JWKS_URL = "https://oauth.telegram.org/.well-known/jwks.json";
const TOKEN_URL = "https://oauth.telegram.org/token";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const appOrigin = (() => { try { return new URL(TELEGRAM_REDIRECT_URI).origin; } catch { return "null"; } })();
const headers = {
  "Access-Control-Allow-Origin": appOrigin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const encoder = new TextEncoder();
const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
};
const encodeBase64Url = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const sha256 = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
const randomSecret = (size = 48) => encodeBase64Url(crypto.getRandomValues(new Uint8Array(size)));

async function verifyTelegramIdToken(token: string, expectedNonce: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid_id_token");
  const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("unsupported_token_algorithm");
  const response = await fetch(JWKS_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("telegram_jwks_unavailable");
  const jwks = await response.json();
  const jwk = (jwks.keys || []).find((key: JsonWebKey & { kid?: string }) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) throw new Error("telegram_signing_key_not_found");
  const publicKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const signingInput = `${parts[0]}.${parts[1]}`;
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, decodeBase64Url(parts[2]), encoder.encode(signingInput));
  if (!valid) throw new Error("invalid_id_token_signature");
  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== ISSUER || !audiences.includes(TELEGRAM_CLIENT_ID)) throw new Error("invalid_id_token_issuer_or_audience");
  if (!Number.isFinite(Number(claims.exp)) || Number(claims.exp) <= now) throw new Error("expired_id_token");
  if (Number(claims.iat) > now + 60) throw new Error("id_token_issued_in_future");
  if (claims.nonce !== expectedNonce) throw new Error("invalid_id_token_nonce");
  if (!/^\d{1,32}$/.test(String(claims.sub || ""))) throw new Error("invalid_telegram_subject");
  return claims;
}

async function getOrCreateUser(claims: Record<string, unknown>) {
  const subject = String(claims.sub);
  const digest = Array.from(await sha256(subject), byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
  const email = `tg_${digest}@users.rim.invalid`;
  const profile = {
    telegram_id: subject,
    full_name: String(claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(" ") || "Пользователь Telegram").slice(0, 120),
    username: `rim_tg_${digest.slice(0, 10)}`,
    telegram_username: String(claims.preferred_username || "").slice(0, 64),
    avatar_url: typeof claims.picture === "string" && claims.picture.startsWith("https://") ? claims.picture.slice(0, 2048) : null
  };

  const { data: existing, error: lookupError } = await admin.from("rim_auth_identities")
    .select("user_id,status").eq("provider", "telegram").eq("provider_subject", subject).maybeSingle();
  if (lookupError) throw new Error("identity_lookup_failed");
  if (existing?.status === "active" && existing.user_id) return { userId: existing.user_id, email };
  if (existing?.status === "provisioning") throw new Error("identity_provisioning_retry");

  const { error: reservationError } = await admin.from("rim_auth_identities").insert({
    provider: "telegram", provider_subject: subject, status: "provisioning", profile
  });
  if (reservationError) {
    const { data: winner } = await admin.from("rim_auth_identities").select("user_id,status")
      .eq("provider", "telegram").eq("provider_subject", subject).maybeSingle();
    if (winner?.status === "active" && winner.user_id) return { userId: winner.user_id, email };
    throw new Error("identity_provisioning_retry");
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: randomSecret(48),
    email_confirm: true,
    user_metadata: {
      auth_provider: "telegram",
      telegram_id: subject,
      full_name: profile.full_name,
      display_name: profile.full_name,
      username: profile.username,
      telegram_username: profile.telegram_username || null,
      avatar_url: profile.avatar_url
    }
  });
  if (createError || !created.user) {
    await admin.from("rim_auth_identities").delete().eq("provider", "telegram").eq("provider_subject", subject).eq("status", "provisioning");
    throw new Error(createError?.message || "user_creation_failed");
  }

  const { error: activateError } = await admin.from("rim_auth_identities").update({
    user_id: created.user.id, status: "active", updated_at: new Date().toISOString()
  }).eq("provider", "telegram").eq("provider_subject", subject).eq("status", "provisioning");
  if (activateError) {
    await admin.auth.admin.deleteUser(created.user.id);
    await admin.from("rim_auth_identities").delete().eq("provider", "telegram").eq("provider_subject", subject);
    throw new Error("identity_activation_failed");
  }
  return { userId: created.user.id, email };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!TELEGRAM_CLIENT_SECRET || !TELEGRAM_REDIRECT_URI || appOrigin === "null") {
    return json({ error: "telegram_auth_not_configured", message: "В Supabase Edge Function Secrets необходимо задать TELEGRAM_CLIENT_SECRET и TELEGRAM_REDIRECT_URI." }, 503);
  }
  if (request.headers.get("origin") && request.headers.get("origin") !== appOrigin) return json({ error: "origin_not_allowed" }, 403);

  try {
    const body = await request.json();
    const code = String(body.code || "");
    const verifier = String(body.code_verifier || "");
    const nonce = String(body.nonce || "");
    const redirectUri = String(body.redirect_uri || "");
    if (code.length < 8 || code.length > 4096 || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || nonce.length < 16 || nonce.length > 256 || redirectUri !== TELEGRAM_REDIRECT_URI) {
      return json({ error: "invalid_request" }, 400);
    }

    const credentials = btoa(`${TELEGRAM_CLIENT_ID}:${TELEGRAM_CLIENT_SECRET}`);
    const form = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: TELEGRAM_CLIENT_ID, code_verifier: verifier });
    const tokenResponse = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: form
    });
    const tokenSet = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || typeof tokenSet.id_token !== "string") return json({ error: "telegram_code_exchange_failed" }, 401);

    const claims = await verifyTelegramIdToken(tokenSet.id_token, nonce);
    const { userId, email } = await getOrCreateUser(claims);
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError || !link?.properties?.hashed_token) return json({ error: "session_issue_failed" }, 500);

    return json({ token_hash: link.properties.hashed_token, user_id: userId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    const retry = message === "identity_provisioning_retry";
    console.error("Telegram auth rejected", message);
    return json({ error: retry ? "identity_provisioning_retry" : "telegram_auth_failed", message: retry ? "Авторизация ещё обрабатывается. Повторите попытку через несколько секунд." : "Не удалось подтвердить вход Telegram. Начните вход заново." }, retry ? 409 : 401);
  }
});
