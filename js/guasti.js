// Segnalazione dei guasti.
//
// Prima un errore nel ciclo di gioco finiva in console.error e moriva lì: se il
// gioco si rompeva sul telefono di un amico, nessuno l'avrebbe mai saputo.
//
// Tre regole, e sono tutte più importanti di quello che il modulo fa:
//
//  1. Non deve mai peggiorare le cose. Ogni cosa qui dentro è racchiusa: un
//     guasto nel segnalatore di guasti sarebbe la beffa perfetta.
//  2. Non deve inondare. Lo stesso errore si ripete a ogni fotogramma, quindi
//     si tiene memoria di cosa è già stato spedito in questa sessione.
//  3. Non deve mandare dati personali. Va il messaggio, il punto e la versione;
//     nessun nickname, nessuna email, nessun indirizzo di pagina con parametri.
import { SUPABASE_URL, SUPABASE_ANON_KEY, ONLINE } from './config.js';

const MAX_PER_SESSIONE = 8;
const gia = new Set();
let spediti = 0;

function impronta(messaggio, dove) {
  return String(messaggio).slice(0, 200) + '|' + String(dove || '').slice(0, 120);
}

export function segnala(messaggio, dove, stack) {
  try {
    if (!ONLINE || !messaggio) return;
    if (spediti >= MAX_PER_SESSIONE) return;
    const chiave = impronta(messaggio, dove);
    if (gia.has(chiave)) return;
    gia.add(chiave);
    spediti++;

    // fetch diretto e non il client Supabase: il client potrebbe essere
    // proprio la cosa che non si è caricata.
    fetch(`${SUPABASE_URL}/rest/v1/rpc/segnala_errore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({
        p_messaggio: String(messaggio).slice(0, 300),
        p_dove: String(dove || '').slice(0, 200),
        p_stack: stack ? String(stack).slice(0, 2000) : null,
        p_versione: window.BEEPPY_V || null,
        p_agente: navigator.userAgent.slice(0, 200),
      }),
      keepalive: true,   // parte anche se la pagina si sta chiudendo
    }).catch(() => { /* niente: se non parte, pazienza */ });
  } catch (e) { /* mai, per nessun motivo, propagare da qui */ }
}

export function ascolta() {
  try {
    window.addEventListener('error', (e) => {
      // Le risorse che non si caricano arrivano qui senza messaggio: sono
      // altrettanto interessanti (un modulo mancante rompe tutto) ma vanno
      // descritte a mano, perché e.message è vuoto.
      if (e.message) {
        segnala(e.message, `${accorcia(e.filename)}:${e.lineno}`, e.error && e.error.stack);
      } else if (e.target && e.target.src) {
        segnala('risorsa non caricata', accorcia(e.target.src));
      }
    });
    window.addEventListener('unhandledrejection', (e) => {
      const r = e.reason;
      segnala(
        (r && (r.message || r.toString())) || 'promessa rifiutata senza motivo',
        'unhandledrejection',
        r && r.stack
      );
    });
  } catch (e) { /* niente */ }
}

// Solo il nome del file: un indirizzo completo può contenere parametri, e i
// parametri sono il posto in cui i dati personali finiscono per sbaglio.
function accorcia(url) {
  try {
    return new URL(url, location.href).pathname.split('/').pop() || '?';
  } catch (e) {
    return '?';
  }
}
