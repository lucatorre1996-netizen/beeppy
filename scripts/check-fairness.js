// Controllo di equità: ogni coppia di tronchi generata deve essere
// raggiungibile in volo.
//
// Storia di questo file: la posizione del varco era casuale dentro tutta
// l'altezza utile, quindi capitava un varco in basso seguito da uno in alto con
// 396 unità di dislivello, mentre l'ape nel tempo disponibile ne risale 201.
// Non era difficoltà, era una partita persa a sorte, e si sentiva come un muro
// verso i 28 punti. Questo controllo impedisce che il problema ritorni ritoccando
// gravità, impulso, velocità o spaziatura.
import { Sim } from '../js/sim.js';
import * as K from '../js/constants.js';

const TRONCHI = 400;
const SEEDS = [1, 7, 42, 1234, 99999, 31337, 8080808];

// Quanto può salire l'ape nel tempo che passa fra due tronchi. In salita
// continua ogni battito dà FLAP_V^2/(2*GRAVITY) unità e poi si ricade: la
// velocità media di salita è circa metà dell'impulso.
function salitaPossibile(score) {
  return K.CLIMB_RATE * (K.SPACING / K.speedForScore(score));
}

let peggiore = { rapporto: 0 };
let bocciati = 0;

for (const seed of SEEDS) {
  const sim = new Sim(seed, 380);
  const centri = [];
  while (sim.spawned < TRONCHI) {
    sim.spawnUntil(sim.nextTrunkX + K.SPACING); // genera esattamente un tronco
    centri.push(sim.trunks[sim.trunks.length - 1].gapY);
  }

  for (let i = 1; i < centri.length; i++) {
    const salita = centri[i - 1] - centri[i]; // positivo = deve salire
    if (salita <= 0) continue;                // scendere è sempre più facile
    const budget = salitaPossibile(i);
    // serve margine: arrivare all'altezza giusta non basta, va anche centrato
    // nel varco, che a fine partita è largo appena 168 unità
    const soglia = budget * 0.8;
    const rapporto = salita / budget;
    if (rapporto > peggiore.rapporto) {
      peggiore = { rapporto, seed, tronco: i, salita: Math.round(salita), budget: Math.round(budget) };
    }
    if (salita > soglia) bocciati++;
  }
}

// ---------------------------------------------------------------------------
// Secondo invariante: dentro il varco ci deve stare l'ape con il suo rimbalzo.
// Un battito d'ali fa risalire RISE unità e non si può frenare a metà: se il
// varco non lascia almeno questo spazio piu' un margine, il finale diventa
// ingiocabile a prescindere dall'abilità.
const RISE = K.FLAP_V * K.FLAP_V / (2 * K.GRAVITY);
const MARGINE_MINIMO = 40;
let varcoStretto = null;
for (let n = 0; n <= 400; n++) {
  const utile = K.gapForScore(n) - 2 * K.BEE_R - RISE;
  if (utile < MARGINE_MINIMO) {
    varcoStretto = { tronco: n, varco: Math.round(K.gapForScore(n)), utile: Math.round(utile) };
    break;
  }
}
const utileFinale = K.gapForScore(400) - 2 * K.BEE_R - RISE;
console.log(`rimbalzo di un battito: ${RISE.toFixed(0)} unità, hitbox ${2 * K.BEE_R}`);
console.log(`spazio utile nel varco più stretto: ${utileFinale.toFixed(0)} unità ` +
            `(minimo accettato: ${MARGINE_MINIMO})`);

console.log(`tronchi controllati: ${SEEDS.length * TRONCHI}`);
console.log(`caso peggiore: seed ${peggiore.seed}, tronco ${peggiore.tronco} -> ` +
            `richiede ${peggiore.salita} unità di salita su ${peggiore.budget} disponibili ` +
            `(${(peggiore.rapporto * 100).toFixed(0)}% del possibile)`);

if (varcoStretto) {
  console.error(`\nFALLITO: al tronco ${varcoStretto.tronco} il varco è ${varcoStretto.varco} e ` +
                `lascia solo ${varcoStretto.utile} unità utili.`);
  console.error('Alza GAP_MIN in js/constants.js, oppure riduci FLAP_V (rimbalzo più corto).');
  process.exit(1);
}

if (bocciati > 0) {
  console.error(`\nFALLITO: ${bocciati} coppie richiedono più dell'80% della salita possibile.`);
  console.error('Abbassa SHIFT_MARGIN in js/constants.js, oppure rendi il volo più agile.');
  process.exit(1);
}
console.log('\nOK: ogni coppia di tronchi resta entro l\'80% della salita possibile,');
console.log('    e nel varco più stretto l\'ape ci passa con il suo rimbalzo.');
