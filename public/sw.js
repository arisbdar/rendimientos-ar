const CACHE_NAME = 'rendimientos-tty-v10';
const STATIC_ASSETS = [
  '/',
  '/tty.css',
  '/tty.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' bypassea el HTTP cache del browser durante el pre-cache,
  // asi el SW nuevo guarda assets frescos aunque la red tenga una copia vieja.
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })))
    ).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const stale = keys.filter(k => k !== CACHE_NAME);
    await Promise.all(stale.map(k => caches.delete(k)));
    await self.clients.claim();
    // Si había caches viejos borrados, esto es un UPDATE (no primera instalación).
    // Avisamos a todos los tabs abiertos para que se recarguen y vean los assets nuevos.
    if (stale.length > 0) {
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const c of clients) c.postMessage({ type: 'sw-updated' });
    }
  })());
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
