import { SUPABASE_URL, SUPABASE_ANON_KEY, NICK_DOMAIN, ONLINE } from './config.js';

// Livello dati unico per il gioco. Se Supabase non è configurato (o non
// raggiungibile) tutto continua a funzionare in locale: il gioco non deve mai
// diventare inutilizzabile per un problema di rete.

const LS = {
  best: 'beeppy.best',
  nick: 'beeppy.nick',
  muted: 'beeppy.muted',
};

export const state = {
  online: ONLINE,
  connected: false,
  user: null,       // { id, nickname }
  best: 0,
  lastError: null,
};

let sb = null;

export const NICK_RE = /^[a-zA-Z0-9._-]{3,16}$/;

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

export async function nicknameAvailable(nick) {
  try {
    const c = await client();
    const { data, error } = await c.rpc('nickname_available', { p_nick: nick });
    if (error) throw error;
    return data === true;
  } catch (e) {
    return true; // in caso di dubbio lascia decidere al vincolo del database
  }
}

export async function signUp(nick, password) {
  if (!ONLINE) return { ok: false, error: 'Classifica online non configurata.' };
  if (!NICK_RE.test(nick))
    return { ok: false, error: 'Nickname: 3-16 caratteri, lettere numeri . _ -' };
  if (!password || password.length < 6)
    return { ok: false, error: 'La password deve avere almeno 6 caratteri.' };
  try {
    if (!(await nicknameAvailable(nick)))
      return { ok: false, error: 'Questo nickname è già preso.' };
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
