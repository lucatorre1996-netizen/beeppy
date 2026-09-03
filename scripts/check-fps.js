// Tetto ai 60 fps: verifica del rilevamento della frequenza dello schermo.
//
// Riproduce la logica di misuraSchermo() in js/main.js e la mette alla prova con
// sequenze sintetiche, jank d'avvio compreso. La regola che deve reggere sempre:
// il tetto non deve MAI portare sotto i 60 fps disegnati. La prima versione
// misurava la media sui primi 400 ms e su uno schermo a 120 Hz decideva di non
// fare niente; una versione ingenua che dimezza sempre porterebbe uno schermo a
// 90 Hz a 45 fps. Da qui i due casi che sembrano superflui e non lo sono.
//
// Se cambi la formula in main.js, cambiala anche qui: sono due copie, e questo
// file esiste proprio per accorgersi quando divergono.
const CAMPIONI = 90;

function creaMisuratore() {
  const intervalli = new Float64Array(CAMPIONI);
  let iCampione = 0, nCampioni = 0, riscaldamento = 45, precedente = 0, salta = 1;
  return {
    passo(now) {
      if (riscaldamento > 0) { riscaldamento--; precedente = now; return; }
      if (precedente) {
        intervalli[iCampione] = now - precedente;
        iCampione = (iCampione + 1) % CAMPIONI;
        if (nCampioni < CAMPIONI) nCampioni++;
      }
      precedente = now;
      if (nCampioni < CAMPIONI || iCampione !== 0) return;
      const ordinati = Array.from(intervalli).sort((a, b) => a - b);
      const hz = 1000 / ordinati[CAMPIONI >> 1];
      salta = hz >= 100 ? Math.max(2, Math.floor(hz / 60 + 0.05)) : 1;
    },
    get salta() { return salta; },
  };
}

function prova(nome, hz, { jankIniziale = 0, frames = 400 } = {}) {
  const m = creaMisuratore();
  let t = 0;
  for (let i = 0; i < frames; i++) {
    // i primi fotogrammi sono lenti: moduli che si caricano, prima cottura
    const periodo = i < jankIniziale ? 1000 / 22 : 1000 / hz;
    t += periodo;
    m.passo(t);
  }
  const fpsFinali = hz / m.salta;
  const ok = fpsFinali >= 55 && (hz < 100 ? m.salta === 1 : true);
  console.log(
    `${ok ? 'OK ' : 'NO '} ${nome.padEnd(28)} salta=${m.salta}  ->  ${fpsFinali.toFixed(0)} fps disegnati`
  );
  return ok;
}

let tutto = true;
tutto &= prova('60 Hz',                60);
tutto &= prova('60 Hz con jank avvio', 60, { jankIniziale: 60 });
tutto &= prova('90 Hz',                90);
tutto &= prova('120 Hz',              120);
tutto &= prova('120 Hz con jank avvio',120, { jankIniziale: 60 });
tutto &= prova('144 Hz',              144);
tutto &= prova('165 Hz',              165);
tutto &= prova('240 Hz',              240);
console.log(tutto ? '\ntutte le frequenze restano a 55 fps o piu' : '\nQUALCOSA SOTTO SOGLIA');
process.exit(tutto ? 0 : 1);
