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

import { SUPABASE_URL, SUPABASE_ANON_KEY, ONLINE } from './config.js';

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

async function entra(e) {
  e.preventDefault();
  errore('');
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
    await dopoAccesso();
  } catch (err) {
    const m = String((err && err.message) || err).toLowerCase();
    errore(m.includes('invalid login') ? 'Email o password non corrette.' : (err.message || String(err)));
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

  const righe = gio.data || [];
  $('lista').innerHTML = righe.length ? righe.map((r) => `
    <li data-id="${r.id}">
      <div class="chi">
        <b>${fuggi(r.nickname)}</b>${r.admin ? ' <span class="tag">admin</span>' : ''}
        <span class="meta">${r.games_played} partite · iscritto il ${data(r.iscritto)}${r.ultima ? ' · ultima ' + data(r.ultima) : ''}</span>
      </div>
      <span class="punti">${r.best_score}</span>
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
  b.disabled = false;
  b.textContent = 'Salva';
  const err = a.error || r.error || i.error;
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

  // se c'è già una sessione admin salvata, si entra diretti
  client().then(async (c) => {
    const { data } = await c.auth.getSession();
    if (data && data.session) await dopoAccesso();
  });
}
