// Cache "app shell": il gioco si apre anche senza rete (la classifica no).
const CACHE = 'beeppy-v1';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'assets/icon.svg',
  'assets/icon-192.png',
  'js/main.js',
  'js/game.js',
  'js/sim.js',
  'js/render.js',
  'js/palette.js',
  'js/constants.js',
  'js/audio.js',
  'js/ui.js',
  'js/net.js',
  'js/rng.js',
  'js/config.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // le chiamate a Supabase e ai font non vanno mai servite dalla cache
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('index.html')))
  );
});
