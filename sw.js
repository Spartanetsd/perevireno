/* Перевірено — робота без інтернету.
 * Після зміни будь-якого файлу, крім sources.json, збільште номер версії нижче. */
const CACHE = 'perevireno-v1';
const FILES = [
  './',
  'index.html',
  'style.css',
  'search.js',
  'app.js',
  'sources.json',
  'manifest.webmanifest',
  'icon-180.png',
  'icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// База: спершу мережа (щоб бачити оновлення), за 3 с без відповіді — копія на пристрої.
async function baseFirstFromNetwork(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await withTimeout(fetch(request, { cache: 'no-store' }), 3000);
    if (response && response.ok) {
      await cache.put('sources.json', response.clone());
      return response;
    }
    throw new Error('bad response');
  } catch (err) {
    const copy = await cache.match('sources.json');
    if (copy) { return copy; }
    return new Response('{"error":"offline"}', {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}

// Решта файлів: спершу копія на пристрої.
async function fromCacheFirst(request) {
  const copy = await caches.match(request, { ignoreSearch: true });
  if (copy) { return copy; }
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    if (request.mode === 'navigate') {
      const page = await caches.match('index.html');
      if (page) { return page; }
    }
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') { return; }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) { return; }
  if (url.pathname.endsWith('/sources.json')) {
    event.respondWith(baseFirstFromNetwork(request));
    return;
  }
  event.respondWith(fromCacheFirst(request));
});
