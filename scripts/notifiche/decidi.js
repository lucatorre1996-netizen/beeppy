// Decide chi avvisare e con che messaggio.
//
// Questa parte è pura: prende lo stato del gioco e restituisce la lista dei
// messaggi da mandare, senza toccare rete né database. Così si può provare
// senza spedire niente a nessuno (npm run test:notifiche).
//
// Regole di buon vicinato, che valgono più di qualsiasi funzionalità:
//  - una notifica per persona ogni due giorni, mai di più;
//  - una sola per volta, la più utile fra quelle che si potrebbero mandare;
//  - niente notifiche fra le 23 e le 8, che è quando la gente dorme;
//  - chi ha giocato nelle ultime ore va lasciato in pace: sta già giocando.

const GIORNO = 24 * 3600 * 1000;

export const TIPI = ['superato', 'inattivo', 'profilo', 'settimanale'];

// Descrizione delle regole, in un posto solo. La legge anche il pannello di
// amministrazione: se la panoramica mostrata e le regole applicate stessero in
// due file diversi, prima o poi direbbero cose diverse — e chi guarda il
// pannello si fiderebbe di quella sbagliata.
export const LIMITI = [
  ['Massimo per persona', 'una notifica ogni 2 giorni'],
  ['Quante per volta', 'una sola, la più utile fra quelle applicabili'],
  ['Silenzio notturno', 'dalle 23 alle 8 non parte niente'],
  ['Chi sta giocando', 'chi ha giocato nelle ultime 6 ore non viene disturbato'],
];

export const DESCRIZIONI = [
  { tipo: 'superato', titolo: 'Ti hanno superato',
    quando: 'quando qualcuno ti passa in classifica',
    esempio: 'Pueblo ti ha passato: sei 3° in classifica.' },
  { tipo: 'inattivo', titolo: 'Beeppy ti aspetta',
    quando: 'dopo 3 giorni senza giocare (testo diverso oltre i 14)',
    esempio: 'Sono 3 giorni che non giochi. Ti va una partita?' },
  { tipo: 'profilo', titolo: 'Mettici la faccia',
    quando: 'a chi ha giocato almeno 5 partite e non ha una foto — una volta sola',
    esempio: 'Aggiungi una foto al profilo: comparirà accanto al tuo nome.' },
  { tipo: 'settimanale', titolo: 'Nuova settimana',
    quando: 'il lunedì, a chi è in classifica',
    esempio: "Sei 4° con 50. Regge un'altra settimana?" },
];

export function decidi(giocatori, adesso = Date.now(), ora = null) {
  const oraDelGiorno = ora !== null ? ora : new Date(adesso).getHours();
  if (oraDelGiorno >= 23 || oraDelGiorno < 8) return [];

  const messaggi = [];
  for (const g of giocatori) {
    if (!g.iscrizioni || !g.iscrizioni.length) continue;

    // silenzio per due giorni dopo l'ultima notifica
    if (g.ultimaInviata && adesso - g.ultimaInviata < 2 * GIORNO) continue;

    // chi ha giocato nelle ultime sei ore non ha bisogno di essere richiamato
    const daUltimaPartita = g.ultimaPartita ? adesso - g.ultimaPartita : Infinity;
    if (daUltimaPartita < 6 * 3600 * 1000) continue;

    const m = scegli(g, adesso, daUltimaPartita);
    if (m) messaggi.push({ user_id: g.user_id, iscrizioni: g.iscrizioni, ...m });
  }
  return messaggi;
}

// L'ordine conta: la prima che si applica vince. In cima quella che dà più
// motivo di tornare, in fondo quelle di servizio.
function scegli(g, adesso, daUltimaPartita) {
  // 1. Ti hanno superato: c'è qualcosa da rifare, ed è appena successo
  if (g.posizionePrecedente && g.posizione &&
      g.posizione > g.posizionePrecedente && g.superatoDa) {
    return {
      tipo: 'superato',
      titolo: 'Ti hanno superato',
      testo: `${g.superatoDa} ti ha passato: sei ${g.posizione}° in classifica.`,
    };
  }

  // 2. Assente da un po'
  const giorni = Math.floor(daUltimaPartita / GIORNO);
  if (giorni >= 3) {
    return {
      tipo: 'inattivo',
      titolo: 'Beeppy ti aspetta',
      testo: giorni >= 14
        ? `Sono ${giorni} giorni che non voli. Il tuo record di ${g.record} è ancora lì.`
        : `Sono ${giorni} giorni che non giochi. Ti va una partita?`,
    };
  }

  // 3. Profilo incompleto: una volta sola, e solo a chi gioca davvero
  if (!g.haFoto && g.partite >= 5 && g.ultimoTipo !== 'profilo') {
    return {
      tipo: 'profilo',
      titolo: 'Mettici la faccia',
      testo: 'Aggiungi una foto al profilo: comparirà accanto al tuo nome in classifica.',
    };
  }

  // 4. Promemoria del lunedì, per chi è in classifica
  if (new Date(adesso).getDay() === 1 && g.posizione) {
    return {
      tipo: 'settimanale',
      titolo: 'Nuova settimana',
      testo: `Sei ${g.posizione}° con ${g.record}. Regge un'altra settimana?`,
    };
  }
  return null;
}
