// App-shell cache so the installed app opens instantly and works offline
// (food search still needs internet; logs/goals live in localStorage).
// Bump the version whenever app files change - the old cache is dropped.
const CACHE = 'nutritrack-v2';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './storage.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Only serve same-origin app files from cache; API calls (USDA, Anthropic)
  // always go to the network.
  if (url.origin !== location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => cached);
      // Serve cache instantly when we have it, refresh it in the background.
      return cached || fetched;
    })
  );
});
