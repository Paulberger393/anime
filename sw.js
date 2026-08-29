/* Schotter Royale — cache-first service worker.
   Everything the game needs is in this list, so after one visit it runs
   with the phone in flight mode. Bump CACHE to ship an update. */
const CACHE = 'schotter-v1';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './js/core.js', './js/data.js', './js/world.js', './js/ai.js', './js/game.js',
  './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      // keep the cache warm for anything else served from our own origin
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
