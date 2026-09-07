// Tetto ai 60 fps: verifica del rilevamento della frequenza dello schermo.
//
// Riproduce la logica di misuraSchermo() in js/main.js. Due regole devono
// reggere sempre, e sono entrambe nate da guasti veri:
//
//  1. Il tetto non deve MAI portare sotto i 58 fps disegnati.
//     Una versione ingenua che dimezza sempre porterebbe uno schermo a 90 Hz
//     a 45 fps, cioe' peggio di non fare niente.
//
//  2. Il regime non deve OSCILLARE.
//     La prima versione usava una soglia secca a 100 Hz senza isteresi. Un
//     iPhone da 120 Hz che si scalda non scende in modo regolare: ballonzola.
//     Simulato attorno ai 100 Hz, cambiava regime 28 volte al minuto - uno
//     scatto ogni due secondi, che compariva quando il telefono si era
//     scaldato, cioe' dopo circa un minuto di gioco. Era un difetto
//     introdotto dal tetto stesso.
//
// Se cambi la formula in main.js cambiala anche qui: sono due copie, e questo
// file esiste proprio per accorgersi quando divergono.
const CAMPIONI = 90;
const SOGLIA_SU = 115;
const FPS_MINIMI = 58;

function saltoPerFrequenza(hz) {
  if (hz < SOGLIA_SU) return 1;
  let t = Math.max(2, Math.floor(hz / 60 + 0.05));
  while (t > 1 && hz / t < FPS_MINIMI) t--;
  return t;
}

function creaMisuratore() {
  const iv = new Float64Array(CAMPIONI);
  let i = 0, n = 0, risc = 45, prec = 0, salta = 1, desiderato = 1, conferme = 0;
  return {
    passo(now) {
      if (risc > 0) { risc--; prec = now; return; }
      if (prec) { iv[i] = now - prec; i = (i + 1) % CAMPIONI; if (n < CAMPIONI) n++; }
      prec = now;
      if (n < CAMPIONI || i !== 0) return;
      const o = Array.from(iv).sort((a, b) => a - b);
      const hz = 1000 / o[CAMPIONI >> 1];
      const voluto = saltoPerFrequenza(hz);
      if (voluto < salta) { salta = voluto; desiderato = voluto; conferme = 0; return; }
      if (voluto > salta) {
        if (voluto === desiderato) conferme++; else { desiderato = voluto; conferme = 1; }
        if (conferme >= 2) { salta = voluto; conferme = 0; }
        return;
      }
      desiderato = salta; conferme = 0;
    },
    get salta() { return salta; },
  };
}

let tutto = true;

// --------------------------------------------------- 1. frequenze stabili
console.log('schermi a frequenza stabile');
function stabile(nome, hz, { jankIniziale = 0, frames = 600 } = {}) {
  const m = creaMisuratore();
  let t = 0;
  for (let i = 0; i < frames; i++) {
    t += i < jankIniziale ? 1000 / 22 : 1000 / hz;
    m.passo(t);
  }
  const fps = hz / m.salta;
  const ok = fps >= FPS_MINIMI - 0.5;
  if (!ok) tutto = false;
  console.log(`  ${ok ? 'OK ' : 'NO '} ${nome.padEnd(24)} salta=${m.salta} -> ${fps.toFixed(0)} fps disegnati`);
}
stabile('60 Hz', 60);
stabile('60 Hz con jank avvio', 60, { jankIniziale: 60 });
stabile('90 Hz', 90);
stabile('100 Hz', 100);
stabile('110 Hz', 110);
stabile('120 Hz', 120);
stabile('120 Hz con jank avvio', 120, { jankIniziale: 60 });
stabile('144 Hz', 144);
stabile('165 Hz', 165);
stabile('240 Hz', 240);

// ------------------------------------------------ 2. frequenza che balla
// Il caso che ha rotto il gioco davvero: un telefono caldo che non tiene
// una frequenza stabile. Il regime deve restare fermo.
console.log('\nschermo instabile (telefono caldo)');
function instabile(nome, centro, ampiezza, { secondi = 120, maxCambi = 2 } = {}) {
  let seme = 12345;
  const rnd = () => { seme = (seme * 1664525 + 1013904223) >>> 0; return seme / 4294967296; };
  const m = creaMisuratore();
  let t = 0, cambi = 0, prima = m.salta;
  while (t < secondi * 1000) {
    t += 1000 / (centro + (rnd() - 0.5) * ampiezza);
    m.passo(t);
    if (m.salta !== prima) { cambi++; prima = m.salta; }
  }
  const ok = cambi <= maxCambi;
  if (!ok) tutto = false;
  console.log(`  ${ok ? 'OK ' : 'NO '} ${nome.padEnd(24)} ${cambi} cambi di regime in ${secondi}s ` +
              `(massimo accettato: ${maxCambi})`);
}
instabile('attorno a 100 Hz', 100, 14);
instabile('attorno a 115 Hz', 115, 14);
instabile('attorno a 120 Hz', 120, 20);
instabile('attorno a 60 Hz', 60, 10);

console.log(tutto
  ? '\nOK: nessuno schermo scende sotto i 58 fps, e il regime non oscilla.'
  : '\nFALLITO: vedi le righe NO qui sopra.');
process.exit(tutto ? 0 : 1);
