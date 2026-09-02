// Cache "app shell": il gioco si apre anche senza rete (la classifica no).
const CACHE = 'beeppy-v3';
const V = '2'; // deve combaciare con la import map in index.html
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'assets/icon.svg',
  'assets/bee.svg',
  'assets/icon-192.png',
  `js/main.js?v=${V}`,
  `js/game.js?v=${V}`,
  `js/sim.js?v=${V}`,
  `js/render.js?v=${V}`,
  `js/palette.js?v=${V}`,
  `js/constants.js?v=${V}`,
  `js/audio.js?v=${V}`,
  `js/ui.js?v=${V}`,
  `js/net.js?v=${V}`,
  `js/install.js?v=${V}`,
  `js/biometric.js?v=${V}`,
  `js/rng.js?v=${V}`,
  `js/config.js?v=${V}`,
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
  // le chiamate a Supabase e ai font non passano mai per la cache
  if (url.origin !== location.origin) return;

  // Rete per prima, cache come rete di salvataggio. L'ordine inverso
  // (cache-first) è più veloce di un pelo, ma congela il gioco alla versione
  // installata: chi ha già aperto Beeppy non vedrebbe mai un aggiornamento
  // finché non cambia il nome della cache. Per un gioco che riceve ritocchi di
  // taratura, non è un compromesso accettabile.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('index.html')))
  );
});
