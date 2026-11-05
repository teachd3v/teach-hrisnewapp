// Service worker khusus notifikasi push (tidak menyimpan cache apa pun).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    lang: 'id',
    data: { href: data.href || '/' },
  };
  // Tag sama = notifikasi saling menggantikan (tidak menumpuk).
  if (data.tag) { options.tag = data.tag; options.renotify = true; }
  event.waitUntil(self.registration.showNotification(data.title || 'HRIS TEACH', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || '/';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = wins.find((c) => new URL(c.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      existing.postMessage({ type: 'navigate', href }); // SPA berpindah layar tanpa muat ulang
      return;
    }
    await self.clients.openWindow(href);
  })());
});
