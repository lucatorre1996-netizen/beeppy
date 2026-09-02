import { SUPABASE_URL, SUPABASE_ANON_KEY, NICK_DOMAIN, ONLINE } from './config.js';

// Livello dati unico per il gioco. Se Supabase non è configurato (o non
// raggiungibile) tutto continua a funzionare in locale: il gioco non deve mai
// diventare inutilizzabile per un problema di rete.

const LS = {
  best: 'beeppy.best',
  nick: 'beeppy.nick',
  muted: 'beeppy.muted',
  signups: 'beeppy.signups',
};

// Anti-spam sulle registrazioni. Nessuna di queste difese e' invalicabile da
// chi sa quello che fa (il limite per dispositivo si aggira svuotando la
// memoria del browser), ma insieme fermano i bot che riempiono i form in
// automatico e chi crea account in serie a mano. Le protezioni che contano
// davvero stanno sul server: il filtro nickname nel database e i limiti per
// indirizzo IP di Supabase Auth.
const SIGNUP_MAX_PER_DAY = 3;
const SIGNUP_MIN_FILL_MS = 2500; // un umano non compila due campi in meno di 2,5 s

export const state = {
  online: ONLINE,
  connected: false,
  user: null,       // { id, nickname }
  best: 0,
  lastError: null,
};

export const NICK_RE = /^[a-zA-Z0-9._-]{3,16}$/;

export const PIN_MIN = 4;
export const PIN_MAX = 8;
export const PIN_RE = new RegExp(`^[0-9]{${PIN_MIN},${PIN_MAX}}$`);

// Supabase Auth rifiuta password sotto i 6 caratteri, quindi il PIN non può
// essere spedito così com'è: la password vera viene derivata dal PIN lato
// client. L'utente digita 4 cifre, Supabase riceve una stringa lunga.
//
// ATTENZIONE: questa formula non va MAI cambiata. Cambiarla equivale a
// cambiare la password di tutti gli account già registrati, che non
// potrebbero più entrare (e senza email non c'è recupero possibile).
export function pinToPassword(pin) {
  return `beeppy.pin.v1:${pin}`;
}

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/;
export const TEL_RE = /^[0-9 +().-]{6,25}$/;

// L'email è l'unico dato obbligatorio: serve per poter recuperare l'accesso e
// per poterti contattare. Nome, cognome e telefono restano facoltativi.
export function contattiProblem(c) {
  const email = (c.email || '').trim();
  if (!email) return 'L\'email è obbligatoria.';
  if (!EMAIL_RE.test(email)) return 'Questa email non sembra valida.';
  if (email.length > 120) return 'Email troppo lunga.';
  const tel = (c.telefono || '').trim();
  if (tel && !TEL_RE.test(tel)) return 'Il numero di telefono non sembra valido.';
  if ((c.nome || '').length > 60 || (c.cognome || '').length > 60)
    return 'Nome o cognome troppo lunghi.';
  return null;
}

export function pinProblem(pin) {
  const p = (pin || '').trim();
  if (!/^[0-9]*$/.test(p)) return 'Il PIN può contenere solo numeri.';
  if (p.length < PIN_MIN) return `Il PIN deve avere almeno ${PIN_MIN} cifre.`;
  if (p.length > PIN_MAX) return `Il PIN può avere al massimo ${PIN_MAX} cifre.`;
  return null;
}

// Specchio di public.nickname_ok() nel database. Qui serve solo a dare un
// messaggio immediato e gentile: l'autorita' resta il vincolo lato server.
const NICK_SPAM = [
  /(.)\1{3,}/,                                          // aaaa
  /https?|www\./i,                                       // indirizzi web
  /\.(com|it|net|org|io|xyz|ru|shop|online)([^a-z]|$)/i,
  /viagra|casino|scommesse|porno|xxx|forex|bitcoin|crypto|guadagn/i,
];
const NICK_RESERVED = ['admin', 'administrator', 'amministratore', 'moderator', 'mod',
  'root', 'support', 'staff', 'system', 'beeppy', 'official', 'ufficiale', 'null', 'undefined'];

// Ritorna null se il nickname va bene, altrimenti il motivo del rifiuto.
export function nicknameProblem(nick) {
  const n = (nick || '').trim();
  if (!NICK_RE.test(n)) return 'Nickname: da 3 a 16 caratteri, solo lettere, numeri, punto, - e _';
  if (!/[a-zA-Z]/.test(n)) return 'Il nickname deve contenere almeno una lettera.';
  if (NICK_RESERVED.includes(n.toLowerCase())) return 'Questo nickname è riservato, scegline un altro.';
  if (NICK_SPAM.some((re) => re.test(n))) return 'Questo nickname non è ammesso.';
  return null;
}

function signupHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS.signups) || '[]');
    const day = Date.now() - 24 * 3600 * 1000;
    return raw.filter((t) => typeof t === 'number' && t > day);
  } catch (e) {
    return [];
  }
}

// Ritorna null se puo' registrarsi, altrimenti i minuti di attesa.
function signupBlocked() {
  const h = signupHistory();
  if (h.length < SIGNUP_MAX_PER_DAY) return null;
  const oldest = Math.min.apply(null, h);
  const waitMs = oldest + 24 * 3600 * 1000 - Date.now();
  return Math.max(1, Math.round(waitMs / 60000));
}

function recordSignup() {
  const h = signupHistory();
  h.push(Date.now());
  try {
    localStorage.setItem(LS.signups, JSON.stringify(h));
  } catch (e) { /* memoria piena o disattivata: pazienza */ }
}

export function localBest() {
  return Number(localStorage.getItem(LS.best) || 0);
}

export function setLocalBest(v) {
  if (v > localBest()) localStorage.setItem(LS.best, String(v));
}

// Allinea il record locale a quello che dice il server, anche verso il basso.
// Serve perché il valore locale è solo una copia di comodo: l'autorità è il
// database, e un numero che la classifica non conosce non va mostrato.
function syncLocalBest(v) {
  localStorage.setItem(LS.best, String(Math.max(0, v | 0)));
}

export function localNick() {
  return localStorage.getItem(LS.nick) || '';
}

export function getMuted() {
  return localStorage.getItem(LS.muted) === '1';
}

export function setMutedPref(m) {
  localStorage.setItem(LS.muted, m ? '1' : '0');
}

function emailFor(nick) {
  return `${nick.trim().toLowerCase()}@${NICK_DOMAIN}`;
}

// Memorizziamo la PROMESSA, non il risultato. Con `if (sb) return sb` due
// chiamate ravvicinate (init e una query, per esempio) partono entrambe prima
// che la prima finisca e creano due client: Supabase avverte di "Multiple
// GoTrueClient instances", e due client che rinnovano lo stesso token possono
// invalidarsi a vicenda facendo perdere la sessione.
let sbPromise = null;

function client() {
  if (!sbPromise) {
    sbPromise = (async () => {
      // @2 e non una versione fissata: le chiavi pubbliche nuove
      // (sb_publishable_...) hanno bisogno di un client recente.
      const mod = await import('https://esm.sh/@supabase/supabase-js@2');
      return mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      });
    })();
  }
  return sbPromise;
}

function human(err) {
  const m = (err && (err.message || String(err))) || 'errore sconosciuto';
  const l = m.toLowerCase();
  if (l.includes('email obbligatoria'))
    return 'L\'email è obbligatoria.';
  if (l.includes('contatti_email_check') || l.includes('email ~*'))
    return 'Questa email non sembra valida.';
  if (l.includes('registrazioni chiuse'))
    return 'Le registrazioni sono momentaneamente chiuse.';
  if (l.includes('non ammesso') || l.includes('nickname_ok'))
    return 'Questo nickname non è ammesso.';
  if (l.includes('already registered') || l.includes('duplicate') || l.includes('unique'))
    return 'Questo nickname è già preso.';
  if (l.includes('invalid login credentials')) return 'Nickname o PIN non corretti.';
  if (l.includes('password should be')) return 'PIN non accettato dal server.';
  if (l.includes('email not confirmed'))
    return 'Conferma email attiva su Supabase: disattivala (Authentication > Providers > Email).';
  if (l.includes('failed to fetch') || l.includes('networkerror'))
    return 'Nessuna connessione: gioco in modalità offline.';
  if (l.includes('rate limit') || l.includes('too many'))
    return 'Troppi tentativi, riprova fra un minuto.';
  return m;
}

let initPromise = null;

// Ripristina l'eventuale sessione salvata. Non lancia mai: al massimo resta offline.
export function init() {
  if (!initPromise) initPromise = doInit();
  return initPromise;
}

// Chi deve prendere decisioni in base all'essere loggati o no aspetta questa:
// senza, nei primi istanti dopo l'apertura un utente già registrato si vedrebbe
// chiedere di registrarsi.
export function whenReady() {
  return init();
}

async function doInit() {
  state.best = localBest();
  if (!ONLINE) return state;
  try {
    const c = await client();
    state.connected = true;
    const { data, error } = await c.auth.getSession();
    if (error) {
      // token di rinnovo non più valido: si riparte da utente non collegato
      await signOut();
    } else if (data && data.session) {
      await loadProfile(data.session.user.id);
    }
  } catch (e) {
    state.online = false;
    state.lastError = human(e);
  }
  return state;
}

async function loadProfile(userId) {
  const c = await client();
  // maybeSingle e non single: quando la riga non c'è, single risponde 406 e
  // riempie la console di errori invece di dire semplicemente "nessun profilo".
  const [{ data: prof }, { data: sc }] = await Promise.all([
    c.from('profiles').select('nickname, created_at').eq('id', userId).maybeSingle(),
    c.from('scores').select('best_score').eq('user_id', userId).maybeSingle(),
  ]);

  // Nessun profilo leggibile: la sessione salvata punta a un utente che non
  // esiste più (cancellato dal pannello) o a un token non più valido. Meglio
  // ripartire da zero che restare con un utente fantasma, che sembrerebbe
  // collegato ma non potrebbe inviare nessun punteggio.
  if (!prof) {
    await signOut();
    return null;
  }

  state.user = { id: userId, nickname: prof.nickname };
  // Per chi è collegato il record è quello del server, non quello locale: il
  // locale è una copia di comodo e può contenere un punteggio che il server ha
  // scartato. Se resta indietro un punteggio guadagnato davvero, è la UI a
  // rimandarlo subito dopo l'accesso.
  const remote = sc ? sc.best_score : 0;
  state.best = remote;
  syncLocalBest(remote);
  if (state.user.nickname) localStorage.setItem(LS.nick, state.user.nickname);
  return state.user;
}

// 'ok' | 'occupato' | 'non_ammesso' | 'sconosciuto'
export async function nicknameStatus(nick) {
  try {
    const c = await client();
    const { data, error } = await c.rpc('nickname_status', { p_nick: nick });
    if (error) throw error;
    return data || 'sconosciuto';
  } catch (e) {
    return 'sconosciuto'; // in caso di dubbio decide il vincolo del database
  }
}

// guard: { honeypot, elapsedMs } - le difese anti-bot raccolte dal form.
export async function signUp(nick, pin, contatti = {}, guard = {}) {
  if (!ONLINE) return { ok: false, error: 'Classifica online non configurata.' };

  // Campo trappola: invisibile a chi guarda, irresistibile per i bot che
  // compilano ogni input che trovano.
  if (guard.honeypot) return { ok: false, error: 'Registrazione non valida.' };
  if (typeof guard.elapsedMs === 'number' && guard.elapsedMs < SIGNUP_MIN_FILL_MS)
    return { ok: false, error: 'Un attimo troppo veloce: riprova fra un secondo.' };

  const wait = signupBlocked();
  if (wait !== null)
    return { ok: false, error: `Troppi account creati da questo dispositivo. Riprova fra ${wait} minuti.` };

  const problem = nicknameProblem(nick);
  if (problem) return { ok: false, error: problem };
  const pinBad = pinProblem(pin);
  if (pinBad) return { ok: false, error: pinBad };
  const contattiBad = contattiProblem(contatti);
  if (contattiBad) return { ok: false, error: contattiBad };
  try {
    const stato = await nicknameStatus(nick);
    if (stato === 'occupato') return { ok: false, error: 'Questo nickname è già preso.' };
    if (stato === 'non_ammesso') return { ok: false, error: 'Questo nickname non è ammesso.' };
    const c = await client();
    const { data, error } = await c.auth.signUp({
      email: emailFor(nick),
      password: pinToPassword(pin),
      options: {
        data: {
          nickname: nick,
          // il trigger li legge da qui e li scrive nella tabella contatti,
          // nella stessa transazione dell'account
          email_contatto: (contatti.email || '').trim(),
          nome: (contatti.nome || '').trim(),
          cognome: (contatti.cognome || '').trim(),
          telefono: (contatti.telefono || '').trim(),
        },
      },
    });
    if (error) throw error;
    if (!data.session) {
      // succede se la conferma email è rimasta attiva sul progetto
      return { ok: false, error: 'Account creato ma sessione assente: disattiva la conferma email su Supabase.' };
    }
    recordSignup();
    await loadProfile(data.user.id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: human(e) };
  }
}

export async function signIn(nick, pin) {
  if (!ONLINE) return { ok: false, error: 'Classifica online non configurata.' };
  const pinBad = pinProblem(pin);
  if (pinBad) return { ok: false, error: pinBad };
  try {
    const c = await client();
    const { data, error } = await c.auth.signInWithPassword({
      email: emailFor(nick),
      password: pinToPassword(pin),
    });
    if (error) throw error;
    await loadProfile(data.user.id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: human(e) };
  }
}

export async function signOut() {
  try {
    if (sbPromise) await (await client()).auth.signOut();
  } catch (e) { /* ignora */ }
  state.user = null;
  state.best = localBest();
}

// Invia il punteggio. Ritorna sempre qualcosa di utile alla UI, anche offline.
//
// Regola: il record mostrato è quello che il server ha accettato. Un punteggio
// scartato (implausibile, rate limit) non deve diventare il record locale,
// altrimenti la schermata mostrerebbe un numero che la classifica non conosce —
// ed è esattamente quello che succedeva prima di questa versione.
export async function submitScore(res) {
  const eraRecordLocale = res.score > localBest();

  if (!ONLINE || !state.user) {
    setLocalBest(res.score);
    state.best = Math.max(state.best, res.score);
    return { ok: true, offline: true, best: state.best, isRecord: eraRecordLocale };
  }
  try {
    const c = await client();
    const { data, error } = await c.rpc('submit_score', {
      p_score: res.score,
      p_duration_ms: res.durationMs,
      p_flaps: res.flaps,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (row && Number.isFinite(row.best)) {
      state.best = row.best;
      syncLocalBest(row.best);
    }
    return {
      ok: true,
      best: state.best,
      isRecord: Boolean(row && row.is_record),
      reason: row ? row.reason : 'ok',
    };
  } catch (e) {
    // Rete assente: il punteggio è stato guadagnato davvero, lo teniamo come
    // provvisorio in attesa di poterlo rimandare.
    setLocalBest(res.score);
    state.best = Math.max(state.best, res.score);
    return { ok: false, error: human(e), best: state.best, isRecord: eraRecordLocale };
  }
}

// I propri dati di contatto. Li vede solo il proprietario: la tabella ha una
// policy che lo impone, quindi anche chiedendoli per un altro non arriverebbe
// niente.
export async function miContatti() {
  if (!ONLINE || !state.user) return { ok: false, dati: null };
  try {
    const c = await client();
    const { data, error } = await c
      .from('contatti')
      .select('nome, cognome, email, telefono')
      .eq('user_id', state.user.id)
      .maybeSingle();
    if (error) throw error;
    return { ok: true, dati: data };
  } catch (e) {
    return { ok: false, dati: null, error: human(e) };
  }
}

export async function salvaContatti(dati) {
  if (!ONLINE || !state.user) return { ok: false, error: 'Non hai fatto l\'accesso.' };
  const problema = contattiProblem(dati);
  if (problema) return { ok: false, error: problema };
  try {
    const c = await client();
    const { error } = await c
      .from('contatti')
      .update({
        nome: (dati.nome || '').trim() || null,
        cognome: (dati.cognome || '').trim() || null,
        email: dati.email.trim(),
        telefono: (dati.telefono || '').trim() || null,
        aggiornato: new Date().toISOString(),
      })
      .eq('user_id', state.user.id);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: human(e) };
  }
}

// La configurazione la legge chiunque: serve al gioco per mostrare l'annuncio
// scritto dall'amministratore. La scrittura invece vive solo nella pagina admin.
export async function leggiConfig() {
  if (!ONLINE) return {};
  try {
    const c = await client();
    const { data, error } = await c.from('app_config').select('chiave, valore');
    if (error) throw error;
    const out = {};
    for (const r of data || []) out[r.chiave] = r.valore;
    return out;
  } catch (e) {
    return {}; // la tabella potrebbe non esistere ancora: nessun annuncio, nessun danno
  }
}

// --------------------------------------------------- recupero del PIN
//
// Senza email non esiste il "ti mandiamo un link". Alla registrazione si genera
// un codice, lo si mostra una volta sola e se ne salva sul server solo
// l'impronta: chi lo conserva può rimettere il PIN, chi lo perde no. È poco,
// ma prima non c'era proprio nulla.

// Niente 0/O/1/I/L: un codice va copiato a mano, e quei caratteri si confondono.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generaCodiceRecupero() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  let out = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) out += '-';
    out += ALFABETO[b[i] % ALFABETO.length];
  }
  return out; // es. ABCD-EFGH-JKMN-PQRS
}

async function impronta(testo) {
  const dati = new TextEncoder().encode(testo.trim().toUpperCase());
  const buf = await crypto.subtle.digest('SHA-256', dati);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Registra il codice sul proprio account (solo l'impronta viaggia).
export async function salvaCodiceRecupero(codice) {
  if (!ONLINE || !state.user) return { ok: false, error: 'Non hai fatto l\'accesso.' };
  try {
    const c = await client();
    const { error } = await c.rpc('set_recovery_code', { p_hash: await impronta(codice) });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: human(e) };
  }
}

// Rimette il PIN presentando nickname e codice. Non richiede di essere entrati.
export async function recuperaPin(nick, codice, nuovoPin) {
  if (!ONLINE) return { ok: false, error: 'Classifica online non configurata.' };
  const pinBad = pinProblem(nuovoPin);
  if (pinBad) return { ok: false, error: pinBad };
  if (!codice || codice.replace(/[^A-Za-z0-9]/g, '').length < 16)
    return { ok: false, error: 'Il codice di recupero è di 16 caratteri.' };
  try {
    const c = await client();
    const { data, error } = await c.rpc('reset_pin_with_code', {
      p_nick: nick.trim(),
      p_code_hash: await impronta(codice.replace(/[^A-Za-z0-9]/g, '')),
      p_password: pinToPassword(nuovoPin),
    });
    if (error) throw error;
    if (data === 'ok') return { ok: true };
    if (data === 'bloccato')
      return { ok: false, error: 'Troppi tentativi sbagliati: riprova fra un\'ora.' };
    if (data === 'senza_codice')
      return { ok: false, error: 'Questo account non ha un codice di recupero.' };
    return { ok: false, error: 'Nickname o codice di recupero non corretti.' };
  } catch (e) {
    const m = String((e && e.message) || e).toLowerCase();
    if (m.includes('could not find') || m.includes('does not exist'))
      return { ok: false, error: 'Funzione non ancora installata: esegui supabase/schema.sql aggiornato.' };
    return { ok: false, error: human(e) };
  }
}

// Ultime partite giocate, per lo storico nella scheda profilo.
export async function myGames(limit = 10) {
  if (!ONLINE || !state.user) return { ok: false, rows: [] };
  try {
    const c = await client();
    const { data, error } = await c
      .from('games')
      .select('score, duration_ms, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return { ok: true, rows: data || [] };
  } catch (e) {
    // la tabella potrebbe non esistere ancora: non è un errore da mostrare
    return { ok: false, rows: [], error: human(e) };
  }
}

// Statistiche per la scheda profilo. Non serve nessuna funzione dedicata sul
// database: profiles e scores sono leggibili grazie alle policy RLS, e la
// posizione si ottiene contando quanti hanno fatto meglio — una domanda che
// PostgREST sa rispondere senza scaricare la classifica intera.
export async function myStats() {
  if (!ONLINE || !state.user) return { ok: false, error: 'Non hai fatto l\'accesso.' };
  try {
    const c = await client();
    const id = state.user.id;
    const [prof, sc, giocatori] = await Promise.all([
      c.from('profiles').select('nickname, created_at').eq('id', id).maybeSingle(),
      c.from('scores').select('best_score, games_played, total_flaps').eq('user_id', id).maybeSingle(),
      c.from('scores').select('user_id', { count: 'exact', head: true }).gt('best_score', 0),
    ]);
    const record = sc.data ? sc.data.best_score : 0;
    // quanti hanno un record più alto del mio: la mia posizione è il loro numero + 1
    const { count: davanti } = await c
      .from('scores')
      .select('user_id', { count: 'exact', head: true })
      .gt('best_score', record);

    return {
      ok: true,
      nickname: prof.data ? prof.data.nickname : state.user.nickname,
      iscrittoDal: prof.data ? prof.data.created_at : null,
      record,
      partite: sc.data ? sc.data.games_played : 0,
      battiti: sc.data ? Number(sc.data.total_flaps) : 0,
      posizione: record > 0 ? (davanti || 0) + 1 : null,
      giocatori: giocatori.count || 0,
    };
  } catch (e) {
    return { ok: false, error: human(e) };
  }
}

// Cancella l'account e tutto ciò che gli appartiene. Passa da una funzione del
// database perché eliminare un utente richiede privilegi che il client non ha;
// quella funzione può colpire solo chi la chiama.
export async function deleteAccount() {
  if (!ONLINE || !state.user) return { ok: false, error: 'Non hai fatto l\'accesso.' };
  try {
    const c = await client();
    const { error } = await c.rpc('delete_my_account');
    if (error) throw error;
    await signOut();
    // via anche le tracce locali: record, nickname ricordato, sblocco biometrico
    try {
      localStorage.removeItem(LS.best);
      localStorage.removeItem(LS.nick);
      localStorage.removeItem('beeppy.biometric');
    } catch (e) { /* niente */ }
    state.best = 0;
    return { ok: true };
  } catch (e) {
    const m = String((e && e.message) || e).toLowerCase();
    if (m.includes('could not find') || m.includes('does not exist') || m.includes('404'))
      return { ok: false, error: 'Funzione non ancora installata: esegui supabase/schema.sql aggiornato.' };
    return { ok: false, error: human(e) };
  }
}

export async function leaderboard(limit = 50) {
  if (!ONLINE) return { ok: false, error: 'offline', rows: [] };
  try {
    const c = await client();
    const { data, error } = await c
      .from('leaderboard')
      .select('pos, nickname, best_score, user_id')
      .order('pos', { ascending: true })
      .limit(limit);
    if (error) throw error;
    return { ok: true, rows: data || [] };
  } catch (e) {
    return { ok: false, error: human(e), rows: [] };
  }
}
