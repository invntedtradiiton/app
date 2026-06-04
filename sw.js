// out: a field guide — Service Worker
// Caches the shell for offline use; network-first for API calls

const CACHE = 'out-v1';
const SHELL = [
  '/',
  '/index.html',
  '/app.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,300;0,400;0,500;1,300;1,400&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,400&display=swap',
];

// API origins — always network-first, never cache
const API_ORIGINS = [
  'api.open-meteo.com',
  'api.ebird.org',
  'api.inaturalist.org',
  'api.gbif.org',
  'records-ws.nbnatlas.org',
  'nominatim.openstreetmap.org',
  'en.wikipedia.org',
];

// ── Install: cache shell ─────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ───────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for APIs, cache-first for shell ─────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip non-GET
  if (e.request.method !== 'GET') return;

  // Always network for APIs
  if (API_ORIGINS.some(origin => url.hostname.includes(origin))) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 503,
        })
      )
    );
    return;
  }

  // Cache-first for everything else (shell, fonts, Leaflet)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Cache successful responses for shell assets
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (e.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// ── Push notifications (future: daily quest nudge) ───────────────────────────
self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  const title = data.title || 'out: a field guide';
  const options = {
    body: data.body || 'Excellent conditions for a nature encounter right now.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'daily-quest',
    renotify: true,
    data: { url: data.url || '/' },
    actions: [
      { action: 'go', title: '🌿 Go outside' },
      { action: 'dismiss', title: 'Later' },
    ],
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'go' || !e.action) {
    e.waitUntil(clients.openWindow(e.notification.data?.url || '/'));
  }
});
