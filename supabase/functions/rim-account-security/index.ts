import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PEPPER = Deno.env.get("RIM_RECOVERY_PEPPER") || SERVICE_ROLE_KEY;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
const makeCode = () => {
  const raw = crypto.getRandomValues(new Uint8Array(16));
  const value = hex(raw).toUpperCase();
  return value.match(/.{1,4}/g)!.join("-");
};
async function digest(code: string) {
  const baseKey = await crypto.subtle.importKey("raw", encoder.encode(PEPPER), "HKDF", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({
    name: "HKDF", hash: "SHA-256", salt: encoder.encode("RIM/account-security/v1"), info: encoder.encode("recovery-code-hmac")
  }, baseKey, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"]);
  const normalized = code.toUpperCase().replace(/[^A-F0-9]/g, "");
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(normalized))));
}
function bearer(request: Request) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await request.json();
    const action = String(body.action || "");
    if (action === "issue") {
      const token = bearer(request);
      if (!token) return json({ error: "unauthorized" }, 401);
      const { data: authData, error: authError } = await admin.auth.getUser(token);
      if (authError || !authData.user) return json({ error: "unauthorized" }, 401);
      const codes = Array.from({ length: 10 }, makeCode);
      const hashes = await Promise.all(codes.map(digest));
      const { error } = await admin.rpc("rim_rotate_recovery_codes", { p_user_id: authData.user.id, p_code_hashes: hashes });
      if (error) throw new Error("recovery_code_rotation_failed");
      return json({ codes, count: codes.length });
    }

    if (action === "redeem") {
      const code = String(body.code || "").trim();
      if (code.length < 20 || code.length > 64 || !/^[A-Fa-f0-9-]+$/.test(code)) return json({ error: "invalid_recovery_code" }, 400);
      const codeHash = await digest(code);
      const { data: candidate, error: lookupError } = await admin.from("rim_recovery_codes")
        .select("user_id").eq("code_hash", codeHash).is("used_at", null).maybeSingle();
      if (lookupError || !candidate?.user_id) return json({ error: "invalid_or_used_recovery_code" }, 401);
      const { data: userResult, error: userError } = await admin.auth.admin.getUserById(candidate.user_id);
      if (userError || !userResult.user?.email) return json({ error: "recovery_account_unavailable" }, 500);
      const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: userResult.user.email });
      if (linkError || !link?.properties?.hashed_token) return json({ error: "recovery_session_issue_failed" }, 500);
      const { data: consumedUserId, error: consumeError } = await admin.rpc("rim_consume_recovery_code", { p_code_hash: codeHash });
      if (consumeError || consumedUserId !== candidate.user_id) return json({ error: "invalid_or_used_recovery_code" }, 401);
      return json({ token_hash: link.properties.hashed_token });
    }
    return json({ error: "unsupported_action" }, 400);
  } catch (error) {
    console.error("RIM account security request failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "account_security_failed" }, 500);
  }
});
