import * as net from './net.js';
import { setMuted } from './audio.js';
import { initInstall, maybeShowInstallHint, markPlayed } from './install.js';
import * as bio from './biometric.js';

const $ = (id) => document.getElementById(id);
let game = null;
let authMode = 'login';
let lastResult = null;
let authOpenedAt = 0;      // per misurare quanto ci si mette a compilare
let volevaGiocare = false; // se l'accesso arriva da un tentativo di giocare
let ultimoPin = null;      // solo in memoria: serve per attivare la biometria
                           // subito dopo l'accesso, senza richiedere il PIN

export function initUI(g) {
  game = g;
  g.onGameOver = onGameOver;
  g.onStart = () => showScreen('none'); // via il riquadro dei suggerimenti

  // input di gioco: solo lo strato dedicato, così i bottoni non fanno saltare l'ape
  const tap = $('tap-layer');
  const onTap = (e) => {
    e.preventDefault();
    if (game.phase === 'ready' || game.phase === 'playing') game.tap();
  };
  tap.addEventListener('pointerdown', onTap);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (game.phase === 'ready' || game.phase === 'playing') game.tap();
      else if (game.phase === 'menu') startGame();
      else if (game.phase === 'over') startGame();
    }
  });

  $('btn-play').addEventListener('click', startGame);
  $('btn-again').addEventListener('click', startGame);
  $('btn-home').addEventListener('click', () => {
    game.toMenu();
    showScreen('menu');
    refreshMenu();
  });
  $('btn-leaderboard').addEventListener('click', openLeaderboard);
  $('btn-lb2').addEventListener('click', openLeaderboard);
  $('btn-account').addEventListener('click', () => openAuth(null, modoPredefinito()));
  $('btn-signout').addEventListener('click', async () => {
    await net.signOut();
    ultimoPin = null;
    syncAccountChip();
    game.toMenu();
    showScreen('menu');
    openAuth();
    refreshMenu();
  });

  document.querySelectorAll('[data-close]').forEach((b) => {
    b.addEventListener('click', () => closeModal(b.dataset.close));
  });
  document.querySelectorAll('.modal').forEach((m) => {
    m.addEventListener('click', (e) => {
      if (e.target === m) closeModal(m.id);
    });
  });

  $('f-pass').addEventListener('input', () => {
    // solo cifre, anche se qualcuno incolla altro
    const v = $('f-pass').value.replace(/[^0-9]/g, '').slice(0, net.PIN_MAX);
    if (v !== $('f-pass').value) $('f-pass').value = v;
  });

  $('f-nick').addEventListener('input', () => {
    if (authMode !== 'signup') return;
    const v = $('f-nick').value.trim();
    const err = $('auth-error');
    const problema = v.length >= 3 ? net.nicknameProblem(v) : null;
    err.textContent = problema || '';
    err.classList.toggle('hidden', !problema);
  });

  $('btn-bio').addEventListener('click', entraConBiometria);
  $('btn-bio-on').addEventListener('click', attivaBiometria);

  $('tab-login').addEventListener('click', () => setAuthMode('login'));
  $('tab-signup').addEventListener('click', () => setAuthMode('signup'));
  $('auth-form').addEventListener('submit', submitAuth);

  const sound = $('btn-sound');
  const paintSound = () => {
    const m = net.getMuted();
    sound.querySelector('#snd-on').style.display = m ? 'none' : '';
    sound.querySelector('#snd-off').style.display = m ? '' : 'none';
    setMuted(m);
  };
  sound.addEventListener('click', () => {
    net.setMutedPref(!net.getMuted());
    paintSound();
  });
  paintSound();

  if (net.MODO_PROVA) $('offline-note').classList.remove('hidden');
  initInstall();
  syncAccountChip();
  syncLoginNote();
  showScreen('menu');
  refreshMenu();
}

// Per giocare serve un account: così ogni punteggio ha un proprietario e la
// classifica non si riempie di partite anonime. L'unica eccezione è la modalità
// prova (?prova nell'URL), che si dichiara da sé nel menu.
async function startGame() {
  // Senza questa attesa, nei primi istanti dopo l'apertura un utente già
  // registrato si vedrebbe chiedere di registrarsi: la sessione salvata viene
  // ripristinata in modo asincrono.
  await net.whenReady();
  if (net.serveAccount() && !net.state.user) {
    volevaGiocare = true;
    openAuth(giaConosciuto() ? 'Accedi per giocare' : 'Registrati per giocare',
             modoPredefinito());
    return;
  }
  closeModal('modal-lb');
  closeModal('modal-auth');
  game.arm();
  showScreen('ready');
}

export function showScreen(name) {
  for (const id of ['screen-menu', 'screen-ready', 'screen-over']) {
    $(id).classList.toggle('is-on', id === `screen-${name}`);
  }
  // mentre si vola i pulsanti in alto si spostano di mezzo: un tap accidentale
  // non deve aprire una modale a partita in corso.
  document.body.classList.toggle('is-flying', name === 'none' || name === 'ready');

  const hint = $('install-hint');
  if (name === 'menu') maybeShowInstallHint();
  else if (hint) hint.classList.add('hidden');
}

function closeModal(id) {
  $(id).classList.remove('is-on');
}

function openModal(id) {
  $(id).classList.add('is-on');
}

// ------------------------------------------------------------------ partita
async function onGameOver(res) {
  lastResult = res;
  markPlayed();
  showScreen('over');
  $('over-score').textContent = res.score;
  $('over-best').textContent = Math.max(net.state.best, res.score);
  $('over-rank').textContent = '-';
  $('record-badge').classList.add('hidden');
  $('over-status').textContent = net.state.user ? 'Invio del punteggio...' : '';

  const out = await net.submitScore(res);
  $('over-best').textContent = out.best;
  if (out.isRecord && res.score > 0) $('record-badge').classList.remove('hidden');

  if (!net.state.online) {
    $('over-status').textContent = 'Record salvato su questo dispositivo.';
  } else if (!net.state.user) {
    $('over-status').innerHTML = 'Registrati per entrare in classifica.';
  } else if (!out.ok) {
    $('over-status').textContent = out.error;
  } else if (out.reason === 'implausibile') {
    $('over-status').textContent = 'Punteggio non registrato: controllo di plausibilità.';
  } else if (out.reason === 'rate_limit') {
    $('over-status').textContent = 'Punteggio non registrato: troppi invii ravvicinati.';
  } else {
    $('over-status').textContent = 'Punteggio inviato.';
    const pos = await myPosition();
    $('over-rank').textContent = pos;
  }
  refreshMenu();
}

async function myPosition() {
  if (!net.state.user) return '-';
  const { ok, rows } = await net.leaderboard(100);
  if (!ok) return '-';
  const i = rows.findIndex((r) => r.user_id === net.state.user.id);
  return i >= 0 ? `#${rows[i].pos}` : 'oltre la 100a';
}

// ---------------------------------------------------------------- classifica
async function openLeaderboard() {
  openModal('modal-lb');
  const list = $('lb-list');
  const note = $('lb-note');
  list.innerHTML = '<li class="lb-empty">Carico...</li>';
  note.textContent = '';

  if (!net.state.online) {
    list.innerHTML = `<li class="lb-empty">Classifica online non configurata.<br>Il tuo record locale: <b>${net.localBest()}</b></li>`;
    return;
  }
  const { ok, rows, error } = await net.leaderboard(50);
  if (!ok) {
    list.innerHTML = `<li class="lb-empty">${error}</li>`;
    return;
  }
  if (!rows.length) {
    list.innerHTML = '<li class="lb-empty">Nessun punteggio ancora.<br>Il primo record puoi essere tu.</li>';
    return;
  }
  const medal = ['🥇', '🥈', '🥉'];
  list.innerHTML = rows
    .map((r, i) => {
      const me = net.state.user && r.user_id === net.state.user.id;
      const pos = i < 3 ? medal[i] : r.pos;
      return `<li class="${me ? 'me' : ''}"><span class="pos">${pos}</span>` +
             `<span class="nick">${escapeHtml(r.nickname)}</span>` +
             `<span class="pts">${r.best_score}</span></li>`;
    })
    .join('');
  if (net.state.user && !rows.some((r) => r.user_id === net.state.user.id)) {
    note.textContent = 'Non sei ancora fra i primi 50.';
  } else if (!net.state.user) {
    note.textContent = 'Accedi per comparire in classifica.';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ------------------------------------------------------------------ account
function openAuth(titolo, modo) {
  openModal('modal-auth');
  authOpenedAt = Date.now();
  const logged = Boolean(net.state.user);
  const configurato = net.state.online;
  $('auth-forms').classList.toggle('hidden', logged || !configurato);
  $('auth-logged').classList.toggle('hidden', !logged);
  $('auth-nobackend').classList.toggle('hidden', logged || configurato);
  $('auth-error').classList.add('hidden');
  if (logged) {
    $('auth-title').textContent = 'Il tuo account';
    $('auth-nick').textContent = net.state.user.nickname;
    $('auth-best').textContent = net.state.best;
  } else if (!configurato) {
    $('auth-title').textContent = 'Classifica non configurata';
  } else {
    $('auth-title').textContent = titolo || 'Entra in classifica';
    authMode = modo || modoPredefinito();
    setAuthMode(authMode);
    // il nickname di chi ha già giocato qui è un attrito in meno
    const noto = giaConosciuto();
    if (noto && !$('f-nick').value) $('f-nick').value = noto;
  }
  syncBiometria(logged);
}

// Mostra i pulsanti biometrici solo dove hanno senso: lo sblocco a chi lo ha
// già attivato, l'attivazione a chi è dentro e non lo ha ancora fatto.
async function syncBiometria(logged) {
  const btnEntra = $('btn-bio');
  const btnAttiva = $('btn-bio-on');
  const nota = $('bio-note');
  btnEntra.classList.add('hidden');
  btnAttiva.classList.add('hidden');
  nota.classList.add('hidden');

  const disponibile = await bio.available();
  const etichetta = bio.biometricLabel();

  if (!logged) {
    if (disponibile && bio.isEnrolled()) {
      $('bio-label').textContent = `Entra come ${bio.enrolledNick()} con ${etichetta}`;
      btnEntra.classList.remove('hidden');
    }
    return;
  }

  if (!disponibile) {
    nota.textContent = window.isSecureContext
      ? 'Questo dispositivo non supporta lo sblocco biometrico.'
      : `Lo sblocco con ${etichetta} richiede una connessione sicura (https).`;
    nota.classList.remove('hidden');
    return;
  }
  if (bio.isEnrolled() && bio.enrolledNick() === net.state.user.nickname) {
    nota.innerHTML = `Sblocco con <b>${etichetta}</b> attivo su questo dispositivo. ` +
      '<a href="#" id="bio-off">Disattiva</a>';
    nota.classList.remove('hidden');
    const off = document.getElementById('bio-off');
    if (off) off.addEventListener('click', (e) => {
      e.preventDefault();
      bio.forget();
      openAuth();
    });
    return;
  }
  btnAttiva.textContent = `Attiva ${etichetta}`;
  btnAttiva.classList.remove('hidden');
  if (!ultimoPin) {
    nota.textContent = `Per attivare ${etichetta} serve il PIN: esci e rientra, poi attivalo.`;
    nota.classList.remove('hidden');
  }
}

async function entraConBiometria() {
  const btn = $('btn-bio');
  const err = $('auth-error');
  const testo = $('bio-label').textContent;
  btn.disabled = true;
  $('bio-label').textContent = 'Attendi...';
  const sbloccato = await bio.unlock();
  if (!sbloccato.ok) {
    btn.disabled = false;
    $('bio-label').textContent = testo;
    err.textContent = sbloccato.error;
    err.classList.remove('hidden');
    return;
  }
  const out = await net.signIn(sbloccato.nick, sbloccato.pin);
  btn.disabled = false;
  $('bio-label').textContent = testo;
  if (!out.ok) {
    // il PIN salvato non vale più (cambiato altrove): meglio dimenticarlo
    bio.forget();
    err.textContent = `${out.error} Inserisci nickname e PIN.`;
    err.classList.remove('hidden');
    syncBiometria(false);
    return;
  }
  ultimoPin = sbloccato.pin;
  dopoAccesso();
}

async function attivaBiometria() {
  const btn = $('btn-bio-on');
  const nota = $('bio-note');
  if (!ultimoPin || !net.state.user) return;
  btn.disabled = true;
  const prima = btn.textContent;
  btn.textContent = 'Attendi...';
  const out = await bio.enroll(net.state.user.nickname, ultimoPin);
  btn.disabled = false;
  btn.textContent = prima;
  if (!out.ok) {
    nota.textContent = out.error;
    nota.classList.remove('hidden');
    return;
  }
  openAuth();
}

function setAuthMode(mode) {
  authMode = mode;
  $('tab-login').classList.toggle('is-on', mode === 'login');
  $('tab-signup').classList.toggle('is-on', mode === 'signup');
  $('auth-submit').textContent = mode === 'login' ? 'Accedi' : 'Crea account';
  $('f-pass').setAttribute('autocomplete', mode === 'login' ? 'current-password' : 'new-password');
  $('auth-error').classList.add('hidden');
}

async function submitAuth(e) {
  e.preventDefault();
  const nick = $('f-nick').value.trim();
  const pin = $('f-pass').value.trim();
  const err = $('auth-error');
  const btn = $('auth-submit');
  err.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Attendi...';

  const guard = {
    honeypot: $('f-site').value,
    elapsedMs: Date.now() - authOpenedAt,
  };
  const out = authMode === 'login'
    ? await net.signIn(nick, pin)
    : await net.signUp(nick, pin, guard);

  btn.disabled = false;
  setAuthMode(authMode);
  if (!out.ok) {
    // Caso tipico del dispositivo nuovo: uno è già registrato ma qui non lo
    // sappiamo, quindi gli abbiamo proposto la registrazione. "Nickname già
    // preso" non è un vicolo cieco: è la prova che l'account esiste, quindi
    // passiamo all'accesso tenendogli il nickname che ha appena scritto.
    if (authMode === 'signup' && /gi.\s*preso/i.test(out.error)) {
      setAuthMode('login');
      err.textContent = 'Questo nickname esiste già: inserisci il PIN per accedere.';
      err.classList.remove('hidden');
      $('f-pass').value = '';
      $('f-pass').focus();
      return;
    }
    err.textContent = out.error;
    err.classList.remove('hidden');
    return;
  }
  ultimoPin = pin;
  $('f-pass').value = '';
  $('f-site').value = '';
  dopoAccesso();
  // se il punteggio dell'ultima partita non era stato inviato, recuperalo ora
  if (lastResult && lastResult.score > 0) {
    const r = lastResult;
    lastResult = null;
    net.submitScore(r).then(() => refreshMenu());
  }
}

// Chi ha già giocato su questo dispositivo lascia il nickname in memoria: a lui
// va proposto l'accesso, non la registrazione. Proporre "Registrati" a chi ha
// già un account lo manda a sbattere contro "nickname già preso".
function giaConosciuto() {
  return net.localNick();
}

function modoPredefinito() {
  return giaConosciuto() ? 'login' : 'signup';
}

function dopoAccesso() {
  syncAccountChip();
  refreshMenu();
  if (volevaGiocare) {
    volevaGiocare = false;
    closeModal('modal-auth');
    startGame();
    return;
  }
  openAuth();
}

function syncAccountChip() {
  const chip = $('btn-account');
  chip.textContent = net.state.user ? `🐝 ${net.state.user.nickname}` : 'Accedi';
  syncLoginNote();
}

function syncLoginNote() {
  const serve = net.serveAccount() && !net.state.user;
  const noto = giaConosciuto();
  $('login-note').classList.toggle('hidden', !serve);
  $('login-note').textContent = noto
    ? `Bentornato: accedi come ${noto} per giocare e tornare in classifica.`
    : 'Per giocare serve un account: il nickname è il nome che finisce in classifica.';
  $('btn-play').textContent = serve ? (noto ? 'Accedi e gioca' : 'Registrati e gioca') : 'Gioca';
}

async function refreshMenu() {
  $('menu-best').textContent = Math.max(net.state.best, net.localBest());
  if (!net.state.online) {
    $('menu-top').textContent = '-';
    return;
  }
  const { ok, rows } = await net.leaderboard(1);
  $('menu-top').textContent = ok && rows.length ? rows[0].best_score : '-';
}

export { refreshMenu, syncAccountChip };
