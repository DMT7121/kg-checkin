/* King's Grill Staff OS — Safe 4G PWA Service Worker */
const CACHE_VERSION = 'kg-staff-os-v4';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const CORE_SHELL_URLS = [
  '/',
  '/index.html',
  '/site.webmanifest',
  '/android-chrome-192x192.png',
  '/logo_email.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(CORE_SHELL_URLS))
      .catch(() => undefined)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('kg-staff-os-') && key !== STATIC_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept Edge /api or dynamic auth endpoints
  if (url.pathname.startsWith('/api')) return;

  // HTML Navigation: strictly Network-First so new deployments appear immediately; fallback to cached shell offline
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put('/index.html', copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Immutable Vite bundles, AI face detector models, icons & audio: Cache-First for fast 4G repeat loads
  const isCacheableStatic =
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/models/') ||
    url.pathname.startsWith('/audio/') ||
    url.pathname.startsWith('/hdsd-cukcuk/') ||
    /\.(?:png|jpg|jpeg|svg|ico|webmanifest)$/i.test(url.pathname);

  if (!isCacheableStatic) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy)).catch(() => undefined);
        }
        return res;
      });
    })
  );
});
