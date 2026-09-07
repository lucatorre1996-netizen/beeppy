// Il grafo audio deve tornare vuoto.
//
// Questo controllo esiste per un guasto vero, segnalato da chi giocava: "superati
// i 70 inizia a laggare". Non era il rendering e non era la simulazione — quelle
// sono piatte, misurate. Era che ogni suono creava dei nodi, li collegava al
// nodo principale e non li scollegava MAI. `master` tiene un riferimento a ogni
// suo ingresso, quindi niente veniva raccolto dalla memoria, e WebAudio
// ricalcola tutto il grafo circa 375 volte al secondo.
//
// I conti: un battito lascia 5 nodi, un punto 4. Arrivare a 70 punti vuol dire
// circa 180 battiti, cioe' 1180 nodi permanenti - contato nel browser, non
// stimato. Il rallentamento cresceva col TEMPO di gioco; il punteggio era solo
// l'orologio.
//
// Un AudioContext finto basta: qui non interessa il suono, interessa che ogni
// nodo creato venga scollegato.

const creati = [];

class NodoFinto {
  constructor(tipo) {
    this.tipo = tipo;
    this.collegatoA = [];
    this.scollegato = false;
    this.onended = null;
    this.gain = param();
    this.frequency = param();
    this.Q = param();
    creati.push(this);
  }
  connect(altro) { this.collegatoA.push(altro); return altro; }
  disconnect() {
    if (this.scollegato) throw new Error(`${this.tipo} scollegato due volte`);
    this.scollegato = true;
    this.collegatoA.length = 0;
  }
  start() {}
  stop() {}
}

function param() {
  return {
    value: 0,
    setValueAtTime() { return this; },
    exponentialRampToValueAtTime() { return this; },
  };
}

class ContestoFinto {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 48000;
    this.state = 'running';
    this.destination = new NodoFinto('destination');
  }
  createGain() { return new NodoFinto('gain'); }
  createOscillator() { return new NodoFinto('oscillator'); }
  createBufferSource() { return new NodoFinto('bufferSource'); }
  createBiquadFilter() { return new NodoFinto('biquad'); }
  createBuffer(canali, lunghezza) {
    return { getChannelData: () => new Float32Array(lunghezza) };
  }
  resume() {}
}

// I timer non devono partire davvero: qui si vuole verificare la via
// principale, cioe' l'evento `onended` che il browser manda al termine del
// suono. Il timer e' solo una rete di sicurezza e si prova a parte.
const timer = [];
globalThis.setTimeout = (fn, ms) => { timer.push({ fn, ms }); return timer.length; };
globalThis.window = { AudioContext: ContestoFinto };

const audio = await import('../js/audio.js');
audio.initAudio();

// Il nodo principale (`master`) e' creato una volta e DEVE restare collegato:
// e' l'uscita a cui si attacca tutto. Si contano solo i nodi nati dopo di lui.
const permanenti = creati.length;

// Una partita da 70 punti: circa 180 battiti d'ali e 70 punti, piu' la morte.
for (let i = 0; i < 180; i++) audio.sfxFlap();
for (let i = 0; i < 70; i++) audio.sfxScore(i);
audio.sfxHit();
audio.sfxFall();
audio.sfxRecord();

const deiSuoni = creati.slice(permanenti);
const totali = deiSuoni.length;
const primaDelloScollegamento = deiSuoni.filter((n) => !n.scollegato).length;

// Il browser manda `ended` a ogni sorgente quando ha finito.
for (const n of creati) {
  if (n.onended) n.onended();
}

const restati = deiSuoni.filter((n) => !n.scollegato);

console.log('grafo audio dopo una partita da 70 punti');
console.log(`  nodi permanenti (master e uscita): ${permanenti}`);
console.log(`  nodi creati dai suoni: ${totali}`);
console.log(`  ancora collegati prima della fine dei suoni: ${primaDelloScollegamento}`);
console.log(`  ancora collegati DOPO la fine dei suoni: ${restati.length}`);

if (restati.length) {
  const perTipo = {};
  for (const n of restati) perTipo[n.tipo] = (perTipo[n.tipo] || 0) + 1;
  console.error('\nFALLITO: questi nodi restano nel grafo per sempre:', perTipo);
  console.error('Ogni suono deve chiamare chiudi() con TUTTI i nodi che ha creato.');
  console.error('Vedi il commento su chiudi() in js/audio.js: era il difetto');
  console.error('che faceva rallentare il gioco dopo un minuto di volo.');
  process.exit(1);
}

// La rete di sicurezza: se `ended` non arrivasse, ci pensa il timer.
if (!timer.length) {
  console.error('\nFALLITO: nessun timer di riserva. Se il contesto viene sospeso');
  console.error('l evento `ended` puo arrivare tardi o non arrivare affatto.');
  process.exit(1);
}
console.log(`  timer di riserva registrati: ${timer.length}`);
console.log('\nOK: il grafo audio torna vuoto, e la rete di riserva c e.');
