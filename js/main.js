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

// aggiorna la classifica del menu quando la rete è pronta
document.addEventListener('beeppy:net-ready', () => {
  import('./ui.js').then((m) => {
    m.syncAccountChip();
    m.refreshMenu();
  });
});

// service worker: rende il gioco avviabile anche senza rete
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
