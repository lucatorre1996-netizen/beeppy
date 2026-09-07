// Prova delle regole di decisione: nessuna notifica viene spedita.
import { decidi } from './decidi.js';

const ADESSO = new Date('2026-09-07T10:00:00').getTime(); // un lunedì alle 10
const GIORNO = 24 * 3600 * 1000;
const base = { user_id: 'x', iscrizioni: [{}], record: 50, partite: 20, haFoto: true,
               haEmail: true, tipiInviati: [] };

const casi = [
  ['senza email', { ...base, haEmail: false, ultimaPartita: ADESSO - GIORNO }],
  ['senza email, avvisato ieri', { ...base, haEmail: false, ultimaInviata: ADESSO - 25 * 3600 * 1000, ultimaPartita: ADESSO - 9 * GIORNO }],
  ['senza email, avvisato 2 ore fa', { ...base, haEmail: false, ultimaInviata: ADESSO - 2 * 3600 * 1000, ultimaPartita: ADESSO - 9 * GIORNO }],
  ['senza email ma superato', { ...base, haEmail: false, posizione: 3, posizionePrecedente: 1, superatoDa: 'Pueblo', ultimaPartita: ADESSO - GIORNO }],
  ['foto già sollecitata', { ...base, haFoto: false, partite: 12, tipiInviati: ['profilo'], ultimaPartita: ADESSO - GIORNO }],
  ['superato, avvisato 2 giorni fa', { ...base, posizione: 3, posizionePrecedente: 2, superatoDa: 'Pueblo', ultimaInviata: ADESSO - 2 * 3600 * 1000, ultimaPartita: ADESSO - GIORNO }],
  ['superato due volte in 2 ore', { ...base, posizione: 4, posizionePrecedente: 3, superatoDa: 'BeeGee', ultimoSorpasso: ADESSO - 2 * 3600 * 1000, ultimaPartita: ADESSO - GIORNO }],
  ['superato di recente', { ...base, posizione: 3, posizionePrecedente: 2, superatoDa: 'Pueblo', ultimaPartita: ADESSO - GIORNO }],
  ['fermo da 3 giorni', { ...base, ultimaPartita: ADESSO - 3 * GIORNO }],
  ['fermo da 20 giorni', { ...base, ultimaPartita: ADESSO - 20 * GIORNO }],
  ['senza foto, gioca molto', { ...base, haFoto: false, partite: 12, ultimaPartita: ADESSO - GIORNO }],
  ['senza foto ma gioca poco', { ...base, haFoto: false, partite: 2, ultimaPartita: ADESSO - GIORNO }],
  ['in classifica, di lunedì', { ...base, posizione: 4, ultimaPartita: ADESSO - GIORNO }],
  ['ha giocato due ore fa', { ...base, ultimaPartita: ADESSO - 2 * 3600 * 1000 }],
  ['avvisato ieri', { ...base, ultimaPartita: ADESSO - 5 * GIORNO, ultimaInviata: ADESSO - GIORNO }],
  ['senza iscrizioni push', { ...base, iscrizioni: [], ultimaPartita: ADESSO - 9 * GIORNO }],
];

console.log('regole di decisione (lunedì, ore 10)\n');
let errori = 0;
for (const [nome, g] of casi) {
  const out = decidi([g], ADESSO);
  const m = out[0];
  console.log(`  ${nome.padEnd(28)} -> ${m ? m.tipo + ': ' + m.testo : 'nessuna notifica'}`);
}

console.log('\nfascia di silenzio notturno');
for (const ora of [7, 8, 22, 23, 2]) {
  const out = decidi([{ ...base, ultimaPartita: ADESSO - 9 * GIORNO }], ADESSO, ora);
  const atteso = ora >= 8 && ora < 23;
  const ok = (out.length > 0) === atteso;
  if (!ok) errori++;
  console.log(`  alle ${String(ora).padStart(2)}:00 -> ${out.length ? 'manda' : 'tace'} ${ok ? '' : '  SBAGLIATO'}`);
}

console.log('\nnon più di una notifica per persona');
const molte = decidi([{ ...base, haFoto: false, partite: 30, posizione: 3, posizionePrecedente: 1,
                        superatoDa: 'Pueblo', ultimaPartita: ADESSO - 10 * GIORNO }], ADESSO);
console.log(`  chi ricade in quattro casi insieme riceve ${molte.length} notifica (tipo: ${molte[0].tipo})`);
if (molte.length !== 1) errori++;

// ---------------------------------------------------------------------------
// Le righe di stato devono avere tutte le stesse chiavi.
//
// Questo controllo esiste per un guasto vero, capitato in produzione: la
// funzione costruiva cinque chiavi per chi aveva ricevuto una notifica e tre
// per gli altri. PostgREST rifiuta un lotto misto con "PGRST102: All object
// keys must match", e il modo in cui si rompeva era il peggiore possibile —
// le notifiche partivano e poi lo stato non veniva salvato, quindi al giro
// dopo ripartivano identiche.
import { righeStato } from './invia.js';

const QUANDO = '2026-09-07T10:00:00.000Z';

const giocatoriStato = [
  // uno che riceve, e non aveva mai ricevuto niente
  { user_id: 'a', posizione: 3, tipiInviati: [], ultimaInviataIso: null, ultimoTipo: null },
  // uno che riceve, e aveva già ricevuto un altro tipo
  { user_id: 'b', posizione: 1, tipiInviati: ['profilo'], ultimaInviataIso: '2026-09-01T08:00:00.000Z', ultimoTipo: 'profilo' },
  // uno che NON riceve, ma ha una storia da conservare
  { user_id: 'c', posizione: 5, tipiInviati: ['email'], ultimaInviataIso: '2026-09-05T09:00:00.000Z', ultimoTipo: 'email' },
  // uno che non riceve e non ha storia
  { user_id: 'd', posizione: null, tipiInviati: [], ultimaInviataIso: null, ultimoTipo: null },
];
const messaggiStato = [
  { user_id: 'a', tipo: 'superato' },
  { user_id: 'b', tipo: 'settimanale' },
];
const inviatiStato = new Set(['a', 'b']);

const righeS = righeStato(giocatoriStato, messaggiStato, inviatiStato, QUANDO);

console.log('\nrighe di stato da riscrivere');
let guaiStato = 0;

const chiaviAttese = ['user_id', 'posizione', 'tipi_inviati', 'ultima_inviata', 'ultimo_tipo'];
const firmaChiavi = (o) => Object.keys(o).sort().join(',');
const firmaRiferimento = firmaChiavi(righeS[0]);
for (const r of righeS) {
  if (firmaChiavi(r) !== firmaRiferimento) {
    console.error(`  FALLITO: chiavi diverse -> ${firmaChiavi(r)} invece di ${firmaRiferimento}`);
    guaiStato++;
  }
}
for (const k of chiaviAttese) {
  if (!(k in righeS[0])) { console.error(`  FALLITO: manca la chiave ${k}`); guaiStato++; }
}
console.log(`  tutte le ${righeS.length} righe hanno le stesse ${chiaviAttese.length} chiavi: ` +
            (guaiStato ? 'NO' : 'sì'));

// chi riceve: data aggiornata e tipo memorizzato
const a = righeS.find((r) => r.user_id === 'a');
if (a.ultima_inviata !== QUANDO || a.ultimo_tipo !== 'superato' ||
    !a.tipi_inviati.includes('superato')) {
  console.error('  FALLITO: chi riceve non viene aggiornato correttamente', a);
  guaiStato++;
}
const b = righeS.find((r) => r.user_id === 'b');
if (b.tipi_inviati.join(',') !== 'profilo,settimanale') {
  console.error('  FALLITO: la memoria dei tipi già inviatiStato va accodata, non sostituita', b);
  guaiStato++;
}

// chi NON riceve: la storia va conservata, non azzerata
const c = righeS.find((r) => r.user_id === 'c');
if (c.ultima_inviata !== '2026-09-05T09:00:00.000Z' || c.ultimo_tipo !== 'email' ||
    c.tipi_inviati.join(',') !== 'email') {
  console.error('  FALLITO: chi non riceve niente perde la sua storia', c);
  guaiStato++;
}
console.log('  chi non riceve conserva la propria storia: ' + (guaiStato ? 'NO' : 'sì'));

if (guaiStato) {
  console.error('\nFALLITO: lo stato delle notifiche non verrebbe salvato.');
}
if (!guaiStato) console.log('  aggiornamento dello stato: OK');

// Unica uscita, in fondo. Prima stava a metà file e i controlli aggiunti dopo
// non venivano nemmeno eseguiti: un test che non gira è peggio di nessun test,
// perché sembra che ci sia.
process.exit(errori + guaiStato ? 1 : 0);
