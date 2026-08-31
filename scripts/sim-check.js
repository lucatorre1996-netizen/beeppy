// Controllo di sanità della simulazione: gira senza browser.
// Verifica determinismo (stesso seed + stessi input => stesso esito).
import { Sim } from '../js/sim.js';

function play(seed, everyNTicks) {
  const sim = new Sim(seed, 450);
  let t = 0;
  while (sim.alive && t < 60 * 120) {
    if (t % everyNTicks === 0) sim.flap();
    sim.step();
    t++;
  }
  return { score: sim.score, ticks: t, seconds: +(t / 120).toFixed(2), flaps: sim.flaps };
}

const a = play(12345, 34);
const b = play(12345, 34);
console.log('run A', a);
console.log('run B', b);
console.log('deterministico:', JSON.stringify(a) === JSON.stringify(b) ? 'OK' : 'FALLITO');
for (const n of [26, 30, 34, 38, 44]) console.log(`tap ogni ${n} tick ->`, play(999, n));
