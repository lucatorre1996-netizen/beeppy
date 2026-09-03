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

// ---------------------------------------------------------------------------
// Determinismo su partite VERE, non su due secondi di caduta.
//
// Il controllo qui sopra usa un tap a cadenza fissa, che muore prima del primo
// tronco: due run identiche di 1,9 secondi non dimostrano granché. Il pilota
// automatico gioca partite da centinaia di punti, quindi qui si confrontano
// migliaia di passi di simulazione, generazione dei tronchi compresa.
import { gioca } from './pilota.js';

const SEMI = [1, 7, 42, 1234, 99999, 31337, 8080808];
let punteggi = [];
let differenze = 0;

for (const seed of SEMI) {
  const a = gioca(seed);
  const b = gioca(seed);
  if (a.score !== b.score || a.tick !== b.tick || a.flaps !== b.flaps) {
    differenze++;
    console.error(`FALLITO: seed ${seed} dà esiti diversi`, a, b);
  }
  punteggi.push(a.score);
}

const media = punteggi.reduce((x, y) => x + y, 0) / punteggi.length;
console.log(`\npilota automatico su ${SEMI.length} semi: ` +
            `${punteggi.join(', ')} punti (media ${media.toFixed(0)})`);

if (differenze > 0) {
  console.error('\nFALLITO: la simulazione non è più deterministica.');
  process.exit(1);
}
console.log('deterministico su partite lunghe: OK');
