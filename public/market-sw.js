/*
 * Marketplace service worker: PWA installability, a small offline shell, and
 * the Web Push handler. Registered by MarketShell on every /market page.
 *
 * Real push delivery needs a push subscription + VAPID keys server-side
 * (see src/lib/market/notifications.ts); the handlers below are already
 * complete for when that lands.
 */

const CACHE = 'cleango-shell-v1';
const SHELL = ['/market'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

// Network-first for marketplace navigations, falling back to the cached shell
// when offline. Everything else goes straight to the network.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.mode === 'navigate' && url.pathname.startsWith('/market')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((hit) => hit || caches.match('/market')),
        ),
    );
  }
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'קלינגו', {
      body: data.body || '',
      icon: '/crm/icon-192.png',
      dir: 'rtl',
      lang: 'he',
      data: { url: data.url || '/market/orders' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/market';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes('/market') && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
