const CACHE = 'mallet-v2';
const ASSETS = [
  '/mallet/',
  '/mallet/index.html',
  '/mallet/style.css',
  '/mallet/parser.js',
  '/mallet/midi.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// Stale-while-revalidate: serve from cache instantly, refresh the cache in the
// background so updates land on the next visit. Falls back to network if uncached.
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.open(CACHE).then(c =>
      c.match(e.request).then(cached => {
        const fresh = fetch(e.request).then(res => {
          if (res.ok && e.request.method === 'GET') c.put(e.request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || fresh;
      })
    )
  );
});
