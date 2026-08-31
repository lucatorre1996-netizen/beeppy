import { Renderer } from './render.js';
import { Game } from './game.js';
import { initUI } from './ui.js';
import { initAudio, setMuted } from './audio.js';
import * as net from './net.js';

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const game = new Game(renderer);

// Il primo dato che serve è il record locale: è immediato e non dipende dalla
// rete. La sessione Supabase arriva dopo, senza bloccare il gioco.
net.init().then(() => {
  document.dispatchEvent(new Event('beeppy:net-ready'));
});

initAudio();
setMuted(net.getMuted());
initUI(game);

// utile per ispezionare lo stato dalla console del browser
window.beeppy = { game, renderer, net };

// ------------------------------------------------------------ ciclo di gioco
let last = performance.now();
let loggedError = false;
function frame(now) {
  // il prossimo frame va chiesto SUBITO: così un errore isolato (es. una
  // dimensione a zero durante la rotazione dello schermo) non ferma il gioco.
  requestAnimationFrame(frame);
  const dt = (now - last) / 1000;
  last = now;
  try {
    game.update(dt);
    renderer.draw(game);
  } catch (e) {
    if (!loggedError) {
      loggedError = true;
      console.error('errore nel frame', e);
    }
  }
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- eventi
let resizeTimer = 0;
function handleResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    renderer.resize();
    game.onResize();
  }, 60);
}
window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', handleResize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', handleResize);

// tornando da sfondo non recuperiamo il tempo passato: azzeriamo il delta
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) last = performance.now();
});

// niente zoom accidentale con due dita durante il gioco
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

// Il menu contestuale (tocco tenuto premuto su mobile, tasto destro su
// desktop) non deve comparire sopra la partita. Nei campi di testo resta,
// altrimenti si perderebbe incolla e correzione.
document.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('input, textarea')) e.preventDefault();
});

// iOS: un tocco prolungato che parte dal canvas non deve avviare una selezione
document.addEventListener('selectstart', (e) => {
  if (!e.target.closest('input, textarea')) e.preventDefault();
});

// aggiorna la classifica del menu quando la rete è pronta
document.addEventListener('beeppy:net-ready', () => {
  import('./ui.js').then((m) => {
    m.syncAccountChip();
    m.refreshMenu();
  });
});

// ---------------------------------------------------------- service worker
//
// Rende il gioco avviabile anche senza rete, ma ha un lato scomodo: quello che
// gira è il worker installato in una visita precedente, con le sue regole,
// anche dopo che hai pubblicato la versione nuova. Si può finire con l'HTML
// nuovo e i moduli vecchi, cioè un'app mezza aggiornata che si comporta in un
// modo che non esiste in nessuna versione. È già costato una sessione di
// debug: la schermata mostrava un testo nuovo con la logica vecchia sotto, e
// nessuna correzione riusciva ad arrivare sul dispositivo.
//
// Perciò in sviluppo il service worker non lo vogliamo affatto, e rimuoviamo
// anche quelli già installati: su un indirizzo locale i file devono arrivare
// sempre dal server, senza intermediari. In produzione invece serve, e allora
// chiediamo un controllo aggiornamenti a ogni apertura e ricarichiamo una volta
// quando un worker nuovo prende il controllo.
function inSviluppo() {
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.local') ||
         /^10\./.test(h) || /^192\.168\./.test(h) ||
         /^172\.(1[6-9]|2\d|3[01])\./.test(h);
}

if ('serviceWorker' in navigator && inSviluppo()) {
  // pulizia: via il worker e le cache lasciate da visite precedenti
  navigator.serviceWorker.getRegistrations()
    .then((regs) => Promise.all(regs.map((r) => r.unregister())))
    .then((tolti) => {
      if (!tolti.length) return null;
      return window.caches ? caches.keys().then((k) => Promise.all(k.map((n) => caches.delete(n)))) : null;
    })
    .then((pulite) => {
      if (!pulite) return;
      console.info('[beeppy] service worker rimosso (indirizzo di sviluppo): ricarico una volta');
      location.reload();
    })
    .catch(() => {});
} else if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const avevaControllore = Boolean(navigator.serviceWorker.controller);
  let ricaricato = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // alla prima installazione non c'è nessun modulo vecchio in giro: la
    // ricarica sarebbe solo un lampo inutile
    if (!avevaControllore || ricaricato) return;
    ricaricato = true;
    location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      // Controllo esplicito degli aggiornamenti a ogni apertura: senza, il
      // browser lo fa quando gli pare e si può restare per giorni su una
      // versione vecchia. Costa una richiesta condizionale per sw.js.
      reg.update().catch(() => {});
    } catch (e) { /* niente: il gioco funziona anche senza service worker */ }
  });
}
