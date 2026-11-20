import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NotificationPreferencesService } from '../src/application/notification-preferences-service.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('push notifications include sender/chat/channel context with per-user preview control', () => {
  const source = fs.readFileSync(path.join(root, 'supabase/functions/rim-push/index.ts'), 'utf8');
  assert.match(source, /message\.body/);
  assert.match(source, /send_channel_post/);
  assert.match(source, /channel_posts_enabled/);
  assert.match(source, /show_message_preview/);
  assert.match(source, /profiles/);
  assert.match(source, /conversations/);
  assert.match(source, /status === 404 \|\| status === 410/);
  assert.match(source, /messages_enabled/);
  assert.match(source, /push_enabled === true/);
  assert.match(source, /rim_check_recovery_rate_limit/);
});

test('service worker displays server-provided chat context and focuses RIM', () => {
  const sw = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  assert.match(sw, /Новое событие/);
  assert.match(sw, /showNotification/);
  assert.match(sw, /clients\.matchAll/);
  assert.match(sw, /payload\.title/);
  assert.match(sw, /payload\.body/);
  assert.doesNotMatch(sw, /event\.data\.text\(\)/);
});

test('push subscribe flow refuses insecure contexts and missing server keys', async () => {
  const service = new NotificationPreferencesService({
    client: { functions: { invoke: async () => ({ data: { error: 'push_not_configured' }, error: null }) } },
    getUser: () => ({ id: 'u1' }),
    windowRef: { isSecureContext: true, navigator: { serviceWorker: {} }, PushManager: {}, Notification: { requestPermission: async () => 'granted' } }
  });
  const result = await service.subscribePush();
  assert.equal(result.ok, false);
  assert.match(result.error.message, /VAPID public key/);
});

test('notification preferences expose message preview control and canonical service worker', () => {
  const source = fs.readFileSync(path.join(root, 'src/application/notification-preferences-service.js'), 'utf8');
  assert.match(source, /show_message_preview/);
  assert.match(source, /имя, чат и текст сообщения/);
  assert.match(source, /service-worker\.js/);
});
