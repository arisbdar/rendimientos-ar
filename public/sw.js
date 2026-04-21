const CACHE_NAME = 'rendimientos-tty-v1';
const STATIC_ASSETS = [
  '/',
  '/tty.css',
  '/tty.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls: always network, no cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // External (fonts, Chart.js from CDN — though tty.js doesn't use Chart.js): always network
  if (url.hostname === 'cdn.jsdelivr.net'
      || url.hostname === 'fonts.googleapis.com'
      || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Static assets: network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
