// Pagina di amministrazione — logica.
//
// Due cose da tenere a mente leggendo questo file.
//
// 1. Qui dentro NON c'è nessun controllo di sicurezza, e non è una svista: un
//    controllo scritto nel browser lo si toglie in dieci secondi con gli
//    strumenti da sviluppatore. La sicurezza sta nelle funzioni del database,
//    che ricontrollano da sé chi le chiama. Questa pagina è comodità.
//
// 2. Usa una chiave di sessione diversa da quella del gioco, così entrare come
//    amministratore non butta fuori il giocatore e viceversa: sono due identità
//    separate anche nella memoria del browser.

import { SUPABASE_URL, SUPABASE_ANON_KEY, ONLINE, PUSH_ATTIVE } from './config.js';
// Le descrizioni arrivano dallo stesso file che decide gli invii: se stessero
// in due posti, la panoramica mostrata qui e le notifiche spedite davvero prima
// o poi direbbero cose diverse.
import { DESCRIZIONI, LIMITI } from '../scripts/notifiche/decidi.js';

const $ = (id) => document.getElementById(id);
let sb = null;

async function client() {
  if (!sb) {
    const mod = await import('https://esm.sh/@supabase/supabase-js@2');
    sb = mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'beeppy-admin-auth', // separata da quella del gioco
      },
    });
  }
  return sb;
}

function mostra(quale) {
  for (const id of ['schermata-accesso', 'schermata-pannello']) {
    $(id).classList.toggle('nascosto', id !== quale);
  }
}

function errore(testo) {
  const e = $('accesso-errore');
  e.textContent = testo || '';
  e.classList.toggle('nascosto', !testo);
}

function esito(testo, cattivo) {
  const e = $('esito');
  e.textContent = testo || '';
  e.className = 'esito' + (cattivo ? ' cattivo' : '') + (testo ? '' : ' nascosto');
}

// ------------------------------------------------------------------ accesso
//
// Tre freni contro i tentativi automatici. Nessuno è invalicabile da solo — la
// difesa che conta davvero sono i limiti per indirizzo IP di Supabase Auth, che
// stanno sul server e non si aggirano da qui — ma insieme fermano la fascia di
// attacchi che si fa con uno script buttato lì.
const APERTA_ALLE = Date.now();
const TEMPO_MINIMO = 1500;   // un umano non compila due campi in un secondo e mezzo
const CHIAVE_TENTATIVI = 'beeppy-admin-tentativi';

function tentativi() {
  try {
    const v = JSON.parse(localStorage.getItem(CHIAVE_TENTATIVI) || '[]');
    const ora = Date.now();
    return v.filter((t) => ora - t < 15 * 60 * 1000); // finestra di 15 minuti
  } catch (err) {
    return [];
  }
}

function segnaTentativo() {
  const v = tentativi();
  v.push(Date.now());
  try { localStorage.setItem(CHIAVE_TENTATIVI, JSON.stringify(v)); } catch (err) { /* niente */ }
}

function azzeraTentativi() {
  try { localStorage.removeItem(CHIAVE_TENTATIVI); } catch (err) { /* niente */ }
}

// Attesa che cresce con i tentativi falliti: 0, 0, 0, 5s, 15s, 45s...
function attesaRichiesta() {
  const n = tentativi().length;
  if (n < 3) return 0;
  return Math.min(300, 5 * Math.pow(3, n - 3)) * 1000;
}

async function entra(e) {
  e.preventDefault();
  errore('');

  // 1) campo trappola compilato: è un bot, si ferma qui senza dire perché
  if ($('azienda').value) {
    errore('Accesso non valido.');
    return;
  }
  // 2) modulo compilato troppo in fretta
  if (Date.now() - APERTA_ALLE < TEMPO_MINIMO) {
    errore('Un attimo troppo veloce: riprova fra un secondo.');
    return;
  }
  // 3) attesa progressiva dopo i tentativi falliti
  const attesa = attesaRichiesta();
  if (attesa > 0) {
    const ultimo = tentativi().slice(-1)[0] || 0;
    const restano = Math.ceil((ultimo + attesa - Date.now()) / 1000);
    if (restano > 0) {
      errore(`Troppi tentativi falliti. Riprova fra ${restano} secondi.`);
      return;
    }
  }

  const btn = $('accesso-invia');
  btn.disabled = true;
  btn.textContent = 'Attendi...';
  try {
    const c = await client();
    const { error } = await c.auth.signInWithPassword({
      email: $('email').value.trim(),
      password: $('password').value,
    });
    if (error) throw error;
    azzeraTentativi();
    await dopoAccesso();
  } catch (err) {
    segnaTentativo();
    const m = String((err && err.message) || err).toLowerCase();
    const n = tentativi().length;
    const coda = n >= 3 ? ` (${n} tentativi falliti: la prossima attesa sarà più lunga)` : '';
    errore((m.includes('invalid login') ? 'Email o password non corrette.'
                                        : (err.message || String(err))) + coda);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entra';
  }
}

async function dopoAccesso() {
  const c = await client();
  const { data, error } = await c.rpc('is_admin');
  if (error || data !== true) {
    // account valido ma senza permessi: si esce subito, senza mostrare nulla
    await c.auth.signOut();
    errore(error && String(error.message).includes('Could not find')
      ? 'Funzioni admin non installate: esegui supabase/schema.sql aggiornato.'
      : 'Questo account non ha i permessi di amministratore.');
    mostra('schermata-accesso');
    return;
  }
  mostra('schermata-pannello');
  const { data: u } = await c.auth.getUser();
  $('chi-sei').textContent = u && u.user ? u.user.email : '';
  await aggiorna();
}

async function esci() {
  const c = await client();
  await c.auth.signOut();
  $('password').value = '';
  mostra('schermata-accesso');
}

// ------------------------------------------------------------------ dati

async function aggiorna() {
  esito('');
  $('lista').innerHTML = '<li class="vuoto">Carico…</li>';
  const c = await client();

  const [st, gio, cfg] = await Promise.all([
    c.rpc('admin_stats'),
    c.rpc('admin_players'),
    c.from('app_config').select('chiave, valore'),
  ]);

  if (st.error) {
    $('lista').innerHTML = `<li class="vuoto">${st.error.message}</li>`;
    return;
  }
  const s = Array.isArray(st.data) ? st.data[0] : st.data;
  $('numeri').innerHTML = [
    [s.giocatori, 'iscritti'],
    [s.in_classifica, 'in classifica'],
    [s.partite_totali, 'partite totali'],
    [s.partite_oggi, 'partite oggi'],
    [s.nuovi_oggi, 'nuovi oggi'],
  ].map(([v, k]) => `<div class="numero"><b>${v}</b><span>${k}</span></div>`).join('');

  const conf = {};
  for (const r of (cfg.data || [])) conf[r.chiave] = r.valore;
  $('annuncio').value = conf.annuncio || '';
  $('registrazioni').checked = (conf.registrazioni_aperte || 'si') === 'si';
  $('obbliga-installazione').checked = (conf.richiedi_installazione || 'no') === 'si';
  $('notifiche-obbligatorie').checked = (conf.notifiche_obbligatorie || 'si') === 'si';

  riempiPush();
  riempiMisure();
  riempiErrori();

  const righe = gio.data || [];
  $('lista').innerHTML = righe.length ? righe.map((r) => `
    <li data-id="${r.id}">
      <div class="chi">
        <b>${fuggi(r.nickname)}</b>${r.admin ? ' <span class="tag">admin</span>' : ''}
        <span class="meta">${r.games_played} partite · iscritto il ${data(r.iscritto)}${r.ultima ? ' · ultima ' + data(r.ultima) : ''}</span>
      </div>
      <span class="punti">${r.best_score}</span>
      <button class="azione" data-azione="contatti">contatti</button>
      <button class="azione" data-azione="azzera">azzera</button>
      <button class="azione rossa" data-azione="elimina">elimina</button>
    </li>`).join('') : '<li class="vuoto">Nessun giocatore.</li>';

  $('lista').querySelectorAll('.azione').forEach((b) => {
    b.addEventListener('click', () => agisci(b));
  });
}

function fuggi(t) {
  return String(t).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function data(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

// Ogni azione chiede conferma sul pulsante stesso: sono irreversibili.
async function agisci(b) {
  const li = b.closest('li');
  const id = li.dataset.id;
  const nome = li.querySelector('b').textContent;
  const azione = b.dataset.azione;

  // i contatti si mostrano e basta: nessuna conferma, nessuna modifica
  if (azione === 'contatti') {
    const c = await client();
    const { data, error } = await c.rpc('admin_contatti', { p_id: id });
    const r = Array.isArray(data) ? data[0] : data;
    esito(error ? error.message
      : r ? `${nome}: ${[r.nome, r.cognome].filter(Boolean).join(' ') || '(nessun nome)'} · ${r.email}${r.telefono ? ' · ' + r.telefono : ''}`
          : `${nome}: nessun recapito registrato.`, Boolean(error));
    return;
  }

  if (b.dataset.armato !== 'si') {
    b.dataset.armato = 'si';
    b.textContent = 'confermi?';
    setTimeout(() => {
      if (b.dataset.armato === 'si') {
        b.dataset.armato = '';
        b.textContent = azione;
      }
    }, 5000);
    return;
  }
  b.disabled = true;
  b.textContent = '…';
  const c = await client();
  const { error } = azione === 'azzera'
    ? await c.rpc('admin_reset_score', { p_id: id })
    : await c.rpc('admin_delete_user', { p_id: id });
  if (error) esito(error.message, true);
  else esito(azione === 'azzera' ? `Punteggio di ${nome} azzerato.` : `${nome} eliminato.`);
  await aggiorna();
}

// Prova concreta dell'SMTP: chiediamo a Supabase di mandare all'amministratore
// l'email di reimpostazione password. Se l'SMTP è configurato arriva; se non lo
// è, non arriva niente. La chiamata risponde "ok" in entrambi i casi — è voluto,
// serve a non rivelare quali indirizzi esistano — quindi la verifica vera è
// guardare la casella.
async function provaEmail() {
  const b = $('prova-email');
  const e = $('esito-email');
  b.disabled = true;
  b.textContent = 'Invio…';
  const c = await client();
  const { data: u } = await c.auth.getUser();
  const indirizzo = u && u.user ? u.user.email : null;
  if (!indirizzo) {
    b.disabled = false;
    b.textContent = "Mandami un'email di prova";
    e.className = 'esito cattivo';
    e.textContent = 'Non riesco a leggere il tuo indirizzo.';
    return;
  }
  const { error } = await c.auth.resetPasswordForEmail(indirizzo, {
    redirectTo: location.origin + '/admin.html',
  });
  b.disabled = false;
  b.textContent = "Mandami un'email di prova";
  if (error) {
    e.className = 'esito cattivo';
    e.textContent = error.message;
    return;
  }
  e.className = 'esito';
  e.textContent = `Richiesta inviata a ${indirizzo}. Controlla la casella, ` +
    'anche nello spam. Se entro un minuto non arriva niente, l\'SMTP non è ' +
    'ancora configurato su Supabase.';
}

// ------------------------------------------------------------ notifiche

async function riempiPush() {
  $('link-actions').href = 'https://github.com/lucatorre1996-netizen/beeppy/actions';

  $('push-regole').innerHTML = DESCRIZIONI.map((d) => `
    <li><div class="chi"><b>${d.titolo}</b>
      <span class="meta">${d.quando}<br>«${d.esempio}»</span></div></li>`).join('');
  $('push-limiti').innerHTML = LIMITI.map(([k, v]) => `
    <li><div class="chi"><b>${k}</b><span class="meta">${v}</span></div></li>`).join('');

  if (!PUSH_ATTIVE) {
    $('push-stato').textContent = 'Chiave pubblica non configurata in js/config.js: ' +
      'le notifiche sono spente.';
    $('push-numeri').innerHTML = '';
    return;
  }
  const c = await client();
  const { data, error } = await c.rpc('admin_push_riepilogo');
  if (error) {
    $('push-stato').textContent = String(error.message).includes('Could not find')
      ? 'Tabelle delle notifiche non ancora create: esegui supabase/schema.sql aggiornato.'
      : error.message;
    $('push-numeri').innerHTML = '';
    return;
  }
  const r = Array.isArray(data) ? data[0] : data;
  $('push-numeri').innerHTML = [
    [r.iscritti, 'persone iscritte'],
    [r.dispositivi, 'dispositivi'],
    [r.annunci_in_coda, 'annunci in coda'],
  ].map(([v, k]) => `<div class="numero"><b>${v}</b><span>${k}</span></div>`).join('');
  $('push-stato').textContent = r.ultimo_invio
    ? 'Ultimo invio: ' + new Date(r.ultimo_invio).toLocaleString('it-IT')
    : (r.iscritti ? 'Nessuna notifica ancora spedita.'
                  : 'Nessuno si è ancora iscritto: le proponiamo a fine partita.');
}

async function accodaAnnuncio() {
  const b = $('accoda-annuncio');
  const titolo = $('annuncio-titolo').value.trim();
  const testo = $('annuncio-testo').value.trim();
  if (!titolo) { esitoPush('Serve almeno il titolo.', true); return; }
  b.disabled = true;
  b.textContent = 'Metto in coda…';
  const c = await client();
  const { error } = await c.rpc('admin_accoda_annuncio', { p_titolo: titolo, p_testo: testo });
  b.disabled = false;
  b.textContent = 'Metti in coda';
  if (error) { esitoPush(error.message, true); return; }
  $('annuncio-titolo').value = '';
  $('annuncio-testo').value = '';
  esitoPush('Annuncio in coda: partirà al prossimo giro, entro due ore.');
  riempiPush();
}

function esitoPush(testo, cattivo) {
  const e = $('esito-push');
  e.textContent = testo;
  e.className = 'esito' + (cattivo ? ' cattivo' : '');
}

async function salvaConfig() {
  const b = $('salva');
  b.disabled = true;
  b.textContent = 'Salvo…';
  const c = await client();
  const a = await c.rpc('admin_set_config', { p_chiave: 'annuncio', p_valore: $('annuncio').value.trim() });
  const r = await c.rpc('admin_set_config', {
    p_chiave: 'registrazioni_aperte',
    p_valore: $('registrazioni').checked ? 'si' : 'no',
  });
  const i = await c.rpc('admin_set_config', {
    p_chiave: 'richiedi_installazione',
    p_valore: $('obbliga-installazione').checked ? 'si' : 'no',
  });
  const n = await c.rpc('admin_set_config', {
    p_chiave: 'notifiche_obbligatorie',
    p_valore: $('notifiche-obbligatorie').checked ? 'si' : 'no',
  });
  b.disabled = false;
  b.textContent = 'Salva';
  const err = a.error || r.error || i.error || n.error;
  esito(err ? err.message : 'Configurazione salvata.', Boolean(err));
}

// ------------------------------------------------------------------ avvio

if (!ONLINE) {
  document.body.innerHTML = '<p style="padding:32px;font:16px system-ui">' +
    'Supabase non è configurato in <code>js/config.js</code>.</p>';
} else {
  $('accesso-form').addEventListener('submit', entra);
  $('esci').addEventListener('click', esci);
  $('salva').addEventListener('click', salvaConfig);
  $('ricarica').addEventListener('click', aggiorna);
  $('pulisci-errori').addEventListener('click', pulisciErrori);
  $('prova-email').addEventListener('click', provaEmail);
  $('accoda-annuncio').addEventListener('click', accodaAnnuncio);

  // se c'è già una sessione admin salvata, si entra diretti
  client().then(async (c) => {
    const { data } = await c.auth.getSession();
    if (data && data.session) await dopoAccesso();
  });
}


// ------------------------------------------------------- come si gioca
//
// Tutto ricavato dalla tabella `games`, che submit_score() riempiva gia' da
// tempo: i dati grezzi c'erano, mancava chi li leggesse. Se le funzioni non
// sono ancora installate le sezioni restano vuote con una spiegazione, invece
// di mostrare un guasto.
async function riempiMisure() {
  const c = await client();
  const [m, d] = await Promise.all([c.rpc('admin_misure'), c.rpc('admin_distribuzione')]);

  const box = $('misure');
  if (m.error) {
    box.innerHTML = `<p class="chi-sei">${fuggi(spiega(m.error))}</p>`;
  } else {
    const r = Array.isArray(m.data) ? m.data[0] : m.data;
    box.innerHTML = [
      [r.partite_7g ?? 0, 'partite 7 giorni'],
      [r.giocatori_7g ?? 0, 'hanno giocato'],
      [r.punteggio_medio ?? '\u2013', 'punteggio medio'],
      [r.punteggio_mediano ?? '\u2013', 'mediano'],
      [r.punteggio_max ?? '\u2013', 'migliore'],
      [r.durata_media_s != null ? r.durata_media_s + 's' : '\u2013', 'durata media'],
      [r.battiti_al_punto ?? '\u2013', 'battiti / punto'],
      [r.morti_sotto_5 != null ? r.morti_sotto_5 + '%' : '\u2013', 'morti prima del 5'],
    ].map(([v, k]) => `<div class="numero"><b>${v}</b><span>${k}</span></div>`).join('');
  }

  const graf = $('distribuzione');
  if (d.error) {
    graf.innerHTML = `<p class="chi-sei">${fuggi(spiega(d.error))}</p>`;
    return;
  }
  const righe = d.data || [];
  if (!righe.length) {
    graf.innerHTML = '<p class="chi-sei">Nessuna partita negli ultimi 30 giorni.</p>';
    return;
  }
  const totale = righe.reduce((a, r) => a + Number(r.partite), 0);
  const massimo = Math.max(...righe.map((r) => Number(r.partite)));
  graf.innerHTML = righe.map((r) => {
    const n = Number(r.partite);
    const perc = ((n / totale) * 100).toFixed(0);
    return `<div class="barra-fascia">
      <span class="etichetta">${fuggi(r.fascia)}</span>
      <span class="traccia"><span class="riempi" style="width:${(n / massimo) * 100}%"></span></span>
      <span class="valore">${n} \u00b7 ${perc}%</span>
    </div>`;
  }).join('');
}

// ------------------------------------------------------------- guasti
async function riempiErrori() {
  const c = await client();
  const { data, error } = await c.rpc('admin_errori', { p_limit: 40 });
  const box = $('errori');
  if (error) {
    box.innerHTML = `<p class="chi-sei">${fuggi(spiega(error))}</p>`;
    return;
  }
  const righe = data || [];
  if (!righe.length) {
    box.innerHTML = '<p class="chi-sei">Nessun guasto segnalato. Buon segno.</p>';
    return;
  }
  box.innerHTML = righe.map((r) => `
    <div class="guasto">
      <div class="guasto-testa">
        <b>${fuggi(r.messaggio)}</b>
        <span class="conteggio">\u00d7${r.occorrenze}</span>
      </div>
      <div class="dettaglio">
        ${r.dove ? fuggi(r.dove) + ' \u00b7 ' : ''}versione ${fuggi(r.versione || '?')} \u00b7
        ultimo ${data(r.ultimo)}
        ${r.esempio_agente ? '<br>' + fuggi(String(r.esempio_agente).slice(0, 110)) : ''}
      </div>
    </div>`).join('');
}

async function pulisciErrori() {
  if (!confirm('Svuotare l\'elenco dei guasti? Non si torna indietro.')) return;
  const c = await client();
  const { data, error } = await c.rpc('admin_pulisci_errori');
  const e = $('errori-esito');
  e.classList.remove('nascosto');
  e.textContent = error ? spiega(error) : `Cancellati ${data} tipi di guasto.`;
  if (!error) riempiErrori();
}

// Le funzioni non ancora installate rispondono con un 404 di PostgREST: va
// detto in italiano, non con il messaggio del database.
function spiega(error) {
  const m = String((error && error.message) || error).toLowerCase();
  if (m.includes('could not find') || m.includes('does not exist') || m.includes('404'))
    return 'Funzione non ancora installata: esegui supabase/schema.sql aggiornato.';
  return (error && error.message) || String(error);
}
