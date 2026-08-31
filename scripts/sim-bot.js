// Bot "giocatore competente": tiene l'ape dentro il varco successivo.
// Serve a validare la taratura: un giocatore bravo deve poter salire di
// punteggio, e la difficoltà crescente deve comunque fermarlo prima o poi.
import { Sim } from '../js/sim.js';
import * as K from '../js/constants.js';

function play(seed, slop = 0) {
  const sim = new Sim(seed, 450);
  let t = 0;
  const maxT = 10 * 60 * 120; // stop di sicurezza: 10 minuti simulati
  while (sim.alive && t < maxT) {
    const next = sim.trunks.find((x) => x.x + K.TRUNK_W > sim.beeX);
    const center = next ? next.gapY : K.WORLD_H * 0.45;
    // controller bang-bang: come un umano, tiene l'ape appena sotto la linea
    // di mira e la rilancia quando scende. `slop` simula i riflessi imprecisi.
    const aim = next ? center + next.gap * 0.15 : center;
    if (sim.bee.y > aim + slop) sim.flap();
    sim.step();
    t++;
  }
  return { punti: sim.score, secondi: +(t / 120).toFixed(1), tapAlSec: +(sim.flaps / (t / 120)).toFixed(1) };
}

console.log('--- riflessi precisi ---');
for (const seed of [1, 7, 42, 1234, 99999]) console.log(' seed', seed, play(seed, 0));
console.log('--- riflessi imprecisi (ritardo di 25px) ---');
for (const seed of [1, 7, 42, 1234, 99999]) console.log(' seed', seed, play(seed, 25));
