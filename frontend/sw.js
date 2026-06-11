const CACHE_NAME = 'eye-staff-v2.7.13';
const STATIC_ASSETS = ['/'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Solo interceptar peticiones GET del mismo origen
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Siempre ir a red para peticiones de API
  if (url.pathname.startsWith('/api/')) return;

  if (e.request.mode === 'navigate') {
    // Para navegación: intentar red, caché como fallback
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // Guardar copia fresca en caché
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match('/'))
    );
  } else {
    // Para assets estáticos: caché primero, red como fallback
    e.respondWith(
      caches.match(e.request).then(res => res || fetch(e.request))
    );
  }
});

// Push notifications
self.addEventListener('push', e => {
  if (!e.data) return;
  try {
    const data = e.data.json();
    e.waitUntil(
      self.registration.showNotification(data.title || 'EYE STAFF', {
        body: data.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        vibrate: [200, 100, 200],
        data: { url: data.url || '/' }
      })
    );
  } catch(err) {
    console.error('[SW] Error en push:', err);
  }
});

// Al pulsar notificación, abrir la app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const targetUrl = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
