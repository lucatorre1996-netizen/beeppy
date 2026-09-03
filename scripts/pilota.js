// Un pilota automatico che sa davvero giocare.
//
// Perché esiste: il collaudo della simulazione usava un tap a cadenza fissa, che
// muore prima del primo tronco. Un test di determinismo su una partita da 1,9
// secondi che non segna mai un punto prova pochissimo, e soprattutto non
// permette di misurare niente — non la difficoltà, non l'effetto di una
// modifica alla curva.
//
// La strategia è volutamente stupida: batte le ali quando l'ape scende sotto una
// soglia posta un po' SOTTO il centro del varco, e basta. Niente previsione.
// La prima versione ne usava una, con 0,16 s di anticipo, e volava troppo alto:
// batteva appena la traiettoria prevista scendeva sotto la mira, e il rimbalzo
// di 71 unità la portava sopra il bordo superiore del varco. Mirare sotto il
// centro fa sì che l'apice del battito cada vicino al centro.
//
// Resta volutamente imperfetto: un pilota ottimo direbbe solo quanto è
// difficile il gioco per un computer, che non interessa a nessuno.
import { Sim } from '../js/sim.js';
import * as K from '../js/constants.js';

export const MIRA = 0.22;   // quanto sotto il centro, in frazioni di varco

export function gioca(seed, { worldW = 380, mira = MIRA, maxTick = 120 * 600 } = {}) {
  const sim = new Sim(seed, worldW);
  while (sim.alive && sim.tick < maxTick) {
    if (sim.bee.y > bersaglio(sim, mira)) sim.flap();
    sim.step();
  }
  return {
    score: sim.score,
    tick: sim.tick,
    secondi: +sim.time.toFixed(2),
    flaps: sim.flaps,
    finito: sim.tick >= maxTick,   // vero = fermato dal limite, non morto
  };
}

// Il primo tronco che l'ape non ha ancora oltrepassato.
function bersaglio(sim, mira) {
  for (const t of sim.trunks) {
    if (t.x + K.TRUNK_W >= sim.beeX - K.BEE_R) return t.gapY + t.gap * mira;
  }
  return K.WORLD_H * 0.45;
}
