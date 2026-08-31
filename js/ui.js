import * as net from './net.js';
import { setMuted } from './audio.js';

const $ = (id) => document.getElementById(id);
let game = null;
let authMode = 'login';
let lastResult = null;

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
  $('btn-account').addEventListener('click', openAuth);
  $('btn-signout').addEventListener('click', async () => {
    await net.signOut();
    syncAccountChip();
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

  if (!net.state.online) $('offline-note').classList.remove('hidden');
  syncAccountChip();
  showScreen('menu');
  refreshMenu();
}

function startGame() {
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
function openAuth() {
  openModal('modal-auth');
  const logged = Boolean(net.state.user);
  $('auth-forms').classList.toggle('hidden', logged);
  $('auth-logged').classList.toggle('hidden', !logged);
  $('auth-error').classList.add('hidden');
  if (logged) {
    $('auth-title').textContent = 'Il tuo account';
    $('auth-nick').textContent = net.state.user.nickname;
    $('auth-best').textContent = net.state.best;
  } else {
    $('auth-title').textContent = 'Entra in classifica';
    setAuthMode(authMode);
  }
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
  const pass = $('f-pass').value;
  const err = $('auth-error');
  const btn = $('auth-submit');
  err.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Attendi...';

  const out = authMode === 'login' ? await net.signIn(nick, pass) : await net.signUp(nick, pass);

  btn.disabled = false;
  setAuthMode(authMode);
  if (!out.ok) {
    err.textContent = out.error;
    err.classList.remove('hidden');
    return;
  }
  $('f-pass').value = '';
  syncAccountChip();
  refreshMenu();
  openAuth();
  // se il punteggio dell'ultima partita non era stato inviato, recuperalo ora
  if (lastResult && lastResult.score > 0) {
    const r = lastResult;
    lastResult = null;
    net.submitScore(r).then(() => refreshMenu());
  }
}

function syncAccountChip() {
  const chip = $('btn-account');
  chip.textContent = net.state.user ? `🐝 ${net.state.user.nickname}` : 'Accedi';
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
