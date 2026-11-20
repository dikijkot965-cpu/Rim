/* RIM Web Push: sender/chat/channel context is supplied by the authenticated server. */
self.addEventListener('push', event => {
  let payload = { title: 'РИМ', body: 'Новое событие', url: '/' };
  try { if (event.data) payload = { ...payload, ...event.data.json() }; } catch { /* malformed push */ }
  const title = String(payload.title || 'РИМ').slice(0, 80);
  const body = String(payload.body || 'Новое событие').slice(0, 180);
  const url = typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: typeof payload.icon === 'string' && /^https:\/\//i.test(payload.icon) ? payload.icon : '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: String(payload.tag || 'rim-notification').slice(0, 100),
    renotify: true,
    timestamp: Date.now(),
    data: { url }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) { await client.focus(); if ('navigate' in client) await client.navigate(target); return; }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
