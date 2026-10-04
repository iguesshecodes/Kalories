// Offline shell. Bump VERSION when you ship changes so phones pick them up.
const VERSION = 'tally-v3';
const CORE = [
  './',
  'index.html',
  'styles.css',
  'icons.svg',
  'manifest.webmanifest',
  'js/app.js',
  'js/calc.js',
  'js/foods.js',
  'js/store.js',
  'js/off.js',
  'js/util.js',
  'js/sheet.js',
  'js/vision.js',
  'js/trends.js',
  'js/setup.js',
  'fonts/archivo.woff2',
  'fonts/newsreader-italic.woff2',
  'fonts/geist-mono-400.woff2',
  'fonts/geist-mono-500.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return; // never cache the server function
  if (url.origin !== self.location.origin) return; // food lookups always go to the network
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (hit) {
        net.catch(() => {});
        return hit;
      }
      const res = await net;
      if (res) return res;
      if (req.mode === 'navigate') return cache.match('index.html');
      return new Response('', { status: 504 });
    })
  );
});
