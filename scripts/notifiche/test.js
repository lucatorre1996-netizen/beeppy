// Prova delle regole di decisione: nessuna notifica viene spedita.
import { decidi } from './decidi.js';

const ADESSO = new Date('2026-09-07T10:00:00').getTime(); // un lunedì alle 10
const GIORNO = 24 * 3600 * 1000;
const base = { user_id: 'x', iscrizioni: [{}], record: 50, partite: 20, haFoto: true,
               haEmail: true, tipiInviati: [] };

const casi = [
  ['senza email', { ...base, haEmail: false, ultimaPartita: ADESSO - GIORNO }],
  ['senza email, già avvisato', { ...base, haEmail: false, tipiInviati: ['email'], ultimaPartita: ADESSO - 9 * GIORNO }],
  ['senza email ma superato', { ...base, haEmail: false, posizione: 3, posizionePrecedente: 1, superatoDa: 'Pueblo', ultimaPartita: ADESSO - GIORNO }],
  ['foto già sollecitata', { ...base, haFoto: false, partite: 12, tipiInviati: ['profilo'], ultimaPartita: ADESSO - GIORNO }],
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

process.exit(errori ? 1 : 0);
