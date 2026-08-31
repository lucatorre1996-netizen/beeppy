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

let sb = null;

export const NICK_RE = /^[a-zA-Z0-9._-]{3,16}$/;

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

async function client() {
  if (sb) return sb;
  const mod = await import('https://esm.sh/@supabase/supabase-js@2.45.4');
  sb = mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return sb;
}

function human(err) {
  const m = (err && (err.message || String(err))) || 'errore sconosciuto';
  const l = m.toLowerCase();
  if (l.includes('non ammesso') || l.includes('nickname_ok'))
    return 'Questo nickname non è ammesso.';
  if (l.includes('already registered') || l.includes('duplicate') || l.includes('unique'))
    return 'Questo nickname è già preso.';
  if (l.includes('invalid login credentials')) return 'Nickname o password non corretti.';
  if (l.includes('password should be')) return 'La password deve avere almeno 6 caratteri.';
  if (l.includes('email not confirmed'))
    return 'Conferma email attiva su Supabase: disattivala (Authentication > Providers > Email).';
  if (l.includes('failed to fetch') || l.includes('networkerror'))
    return 'Nessuna connessione: gioco in modalità offline.';
  if (l.includes('rate limit') || l.includes('too many'))
    return 'Troppi tentativi, riprova fra un minuto.';
  return m;
}

// Ripristina l'eventuale sessione salvata. Non lancia mai: al massimo resta offline.
export async function init() {
  state.best = localBest();
  if (!ONLINE) return state;
  try {
    const c = await client();
    state.connected = true;
    const { data } = await c.auth.getSession();
    if (data && data.session) await loadProfile(data.session.user.id);
  } catch (e) {
    state.online = false;
    state.lastError = human(e);
  }
  return state;
}

async function loadProfile(userId) {
  const c = await client();
  const [{ data: prof }, { data: sc }] = await Promise.all([
    c.from('profiles').select('nickname').eq('id', userId).single(),
    c.from('scores').select('best_score').eq('user_id', userId).maybeSingle(),
  ]);
  state.user = { id: userId, nickname: prof ? prof.nickname : '?' };
  const remote = sc ? sc.best_score : 0;
  state.best = Math.max(remote, localBest());
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
export async function signUp(nick, password, guard = {}) {
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
  if (!password || password.length < 6)
    return { ok: false, error: 'La password deve avere almeno 6 caratteri.' };
  try {
    const stato = await nicknameStatus(nick);
    if (stato === 'occupato') return { ok: false, error: 'Questo nickname è già preso.' };
    if (stato === 'non_ammesso') return { ok: false, error: 'Questo nickname non è ammesso.' };
    const c = await client();
    const { data, error } = await c.auth.signUp({
      email: emailFor(nick),
      password,
      options: { data: { nickname: nick } },
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

export async function signIn(nick, password) {
  if (!ONLINE) return { ok: false, error: 'Classifica online non configurata.' };
  try {
    const c = await client();
    const { data, error } = await c.auth.signInWithPassword({
      email: emailFor(nick),
      password,
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
    if (sb) await sb.auth.signOut();
  } catch (e) { /* ignora */ }
  state.user = null;
  state.best = localBest();
}

// Invia il punteggio. Ritorna sempre qualcosa di utile alla UI, anche offline.
export async function submitScore(res) {
  const wasRecord = res.score > localBest();
  setLocalBest(res.score);

  if (!ONLINE || !state.user) {
    state.best = Math.max(state.best, res.score);
    return { ok: true, offline: true, best: state.best, isRecord: wasRecord };
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
    state.best = Math.max(state.best, row ? row.best : res.score);
    return {
      ok: true,
      best: state.best,
      isRecord: Boolean(row && row.is_record),
      reason: row ? row.reason : 'ok',
    };
  } catch (e) {
    state.best = Math.max(state.best, res.score);
    return { ok: false, error: human(e), best: state.best, isRecord: wasRecord };
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
