import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("RIM_VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE_KEY = Deno.env.get("RIM_VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = Deno.env.get("RIM_VAPID_SUBJECT") || "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0"
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const encoder = new TextEncoder();

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
async function sha256Hex(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}
function configured() {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && /^mailto:|^https:\/\//.test(VAPID_SUBJECT));
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const raw = await request.text();
    if (encoder.encode(raw).byteLength > 16384) return json({ error: "request_too_large" }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400); }
    const action = String(body.action || "");

    if (action === "public_key") {
      if (!VAPID_PUBLIC_KEY) return json({ error: "push_not_configured" }, 503);
      return json({ public_key: VAPID_PUBLIC_KEY });
    }

    const user = await authenticatedUser(request);
    if (!user) return json({ error: "unauthorized" }, 401);

    if (action === "subscribe") {
      const subscription = body.subscription as Record<string, unknown> | null;
      const endpoint = String(subscription?.endpoint || "");
      const keys = subscription?.keys as Record<string, unknown> | undefined;
      if (!/^https:\/\//i.test(endpoint) || endpoint.length > 2048 || !keys?.p256dh || !keys?.auth) {
        return json({ error: "invalid_subscription" }, 400);
      }
      const { data: existing, error: lookupError } = await admin.from("push_subscriptions")
        .select("id,user_id").eq("endpoint", endpoint).maybeSingle();
      if (lookupError) throw new Error("subscription_lookup_failed");
      if (existing && existing.user_id !== user.id) return json({ error: "subscription_owned_by_another_account" }, 409);
      const payload = {
        user_id: user.id,
        endpoint,
        subscription_data: subscription,
        device_label: String(body.device_label || "").slice(0, 180),
        updated_at: new Date().toISOString()
      };
      const saved = existing
        ? await admin.from("push_subscriptions").update(payload).eq("id", existing.id)
        : await admin.from("push_subscriptions").insert(payload);
      if (saved.error) throw new Error("subscription_save_failed");
      const prefs = await admin.from("notification_preferences").upsert({
        user_id: user.id, push_enabled: true, updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });
      if (prefs.error) throw new Error("notification_preferences_save_failed");
      return json({ subscribed: true });
    }

    if (action === "unsubscribe") {
      const endpoint = String(body.endpoint || "");
      if (!/^https:\/\//i.test(endpoint) || endpoint.length > 2048) return json({ error: "invalid_endpoint" }, 400);
      const { error } = await admin.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
      if (error) throw new Error("subscription_delete_failed");
      const prefs = await admin.from("notification_preferences").upsert({
        user_id: user.id, push_enabled: false, updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });
      if (prefs.error) throw new Error("notification_preferences_save_failed");
      return json({ unsubscribed: true });
    }

    if (action === "send_message" || action === "send_channel_post") {
      const itemId = String(body.message_id || body.post_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(itemId)) return json({ error: "invalid_item_id" }, 400);
      if (!configured()) return json({ error: "push_not_configured" }, 503);

      let recipientIds: string[] = [];
      let title = "РИМ";
      let preview = "Новое событие";
      let tag = "rim-event-" + itemId;
      let preferenceField = "messages_enabled";
      let rateAction = "push_message";
      let icon = "/icons/icon-192.png";

      if (action === "send_message") {
        const { data: message, error: messageError } = await admin.from("chat_messages")
          .select("id,conversation_id,sender_id,body,image_path,sticker_id").eq("id", itemId).maybeSingle();
        if (messageError || !message || String(message.sender_id) !== String(user.id)) return json({ error: "message_not_found" }, 404);
        const { data: conversation, error: conversationError } = await admin.from("conversations")
          .select("id,type,title").eq("id", message.conversation_id).maybeSingle();
        if (conversationError || !conversation) throw new Error("conversation_lookup_failed");
        const [{ data: members, error: membersError }, { data: sender, error: senderError }] = await Promise.all([
          admin.from("conversation_members").select("user_id").eq("conversation_id", message.conversation_id).neq("user_id", user.id),
          admin.from("profiles").select("display_name,username,avatar_url,avatar_path").eq("id", user.id).maybeSingle()
        ]);
        if (membersError || senderError) throw new Error("message_notification_context_failed");
        recipientIds = [...new Set((members || []).map(row => String(row.user_id)))];
        const senderName = String(sender?.display_name || sender?.username || "Новое сообщение").slice(0, 80);
        title = senderName;
        if (sender?.avatar_url && /^https:\/\//i.test(sender.avatar_url)) icon = sender.avatar_url;
        else if (sender?.avatar_path) {
          const avatar = await admin.storage.from("avatars").createSignedUrl(sender.avatar_path, 3600);
          if (avatar.data?.signedUrl) icon = avatar.data.signedUrl;
        }
        const rawPreview = String(message.body || (message.image_path ? "Фото" : message.sticker_id ? "Стикер" : "Новое сообщение")).replace(/\s+/g, " ").trim();
        preview = conversation.type === "group"
          ? `${String(conversation.title || "Группа").slice(0, 70)} · ${rawPreview.slice(0, 100)}`
          : rawPreview.slice(0, 140);
        tag = "rim-chat-" + message.conversation_id;
        rateAction = "push_message";
      } else {
        const { data: post, error: postError } = await admin.from("channel_posts")
          .select("id,channel_id,author_id,body,image_path").eq("id", itemId).maybeSingle();
        if (postError || !post || String(post.author_id) !== String(user.id)) return json({ error: "post_not_found" }, 404);
        const [{ data: channel, error: channelError }, { data: members, error: membersError }] = await Promise.all([
          admin.from("channels").select("id,title,avatar_path").eq("id", post.channel_id).maybeSingle(),
          admin.from("channel_members").select("user_id").eq("channel_id", post.channel_id).neq("user_id", user.id)
        ]);
        if (channelError || membersError || !channel) throw new Error("channel_notification_context_failed");
        recipientIds = [...new Set((members || []).map(row => String(row.user_id)))];
        title = String(channel.title || "Новый пост в канале").slice(0, 80);
        if (channel.avatar_path) {
          const avatar = await admin.storage.from("avatars").createSignedUrl(channel.avatar_path, 3600);
          if (avatar.data?.signedUrl) icon = avatar.data.signedUrl;
        }
        const rawPreview = String(post.body || (post.image_path ? "Фото" : "Новая публикация")).replace(/\s+/g, " ").trim();
        preview = rawPreview.slice(0, 140);
        tag = "rim-channel-" + post.channel_id;
        preferenceField = "channel_posts_enabled";
        rateAction = "push_channel_post";
      }

      if (!recipientIds.length) return json({ sent: 0, skipped: true, reason: "no_recipients" });
      const rateKey = await sha256Hex("rim-push-event:" + action + ":" + user.id + ":" + itemId);
      const { data: allowed, error: rateError } = await admin.rpc("rim_check_recovery_rate_limit", {
        p_key_hash: rateKey, p_action: rateAction, p_limit: 1, p_window_seconds: 86400
      });
      if (rateError) throw new Error("push_rate_limit_unavailable");
      if (allowed !== true) return json({ sent: 0, skipped: true, reason: "already_processed" });

      const [preferences, subscriptions] = await Promise.all([
        admin.from("notification_preferences").select("user_id,messages_enabled,channel_posts_enabled,push_enabled,show_message_preview").in("user_id", recipientIds),
        admin.from("push_subscriptions").select("id,user_id,subscription_data").in("user_id", recipientIds)
      ]);
      if (preferences.error || subscriptions.error) throw new Error("push_recipients_lookup_failed");
      const prefByUser = new Map((preferences.data || []).map(row => [String(row.user_id), row]));
      const targets = (subscriptions.data || []).filter(row => {
        const pref = prefByUser.get(String(row.user_id));
        return pref?.push_enabled === true && pref?.[preferenceField] !== false && row.subscription_data;
      });
      if (!targets.length) return json({ sent: 0, skipped: true, reason: "no_enabled_subscriptions" });

      webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
      let sent = 0;
      let failed = 0;
      await Promise.all(targets.map(async target => {
        const pref = prefByUser.get(String(target.user_id));
        const includePreview = pref?.show_message_preview !== false;
        const payload = JSON.stringify({
          title: includePreview ? title : "РИМ",
          body: includePreview ? preview : "Новое событие",
          url: action === "send_channel_post" ? `/` : `/`,
          tag,
          icon,
          event_type: action === "send_channel_post" ? "channel_post" : "message"
        });
        try {
          await webpush.sendNotification(target.subscription_data, payload, { TTL: 120, urgency: "normal" });
          sent += 1;
        } catch (error) {
          failed += 1;
          const status = Number((error as { statusCode?: number })?.statusCode || 0);
          if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("id", target.id);
        }
      }));
      return json({ sent, failed, attempted: targets.length });
    }

    return json({ error: "unsupported_action" }, 400);
  } catch (error) {
    console.error("RIM push request failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "push_request_failed" }, 500);
  }
});
