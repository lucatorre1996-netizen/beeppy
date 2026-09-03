import * as net from './net.js';
import { setMuted } from './audio.js';
import { initInstall, maybeShowInstallHint, markPlayed, isStandalone,
         preparaSchermataInstallazione, chiediInstallazione, promptDisponibile } from './install.js';
import * as bio from './biometric.js';
import * as push from './push.js';
import { drawBee } from './render.js';

const $ = (id) => document.getElementById(id);
let game = null;
let authMode = 'login';
let lastResult = null;
let authOpenedAt = 0;      // per misurare quanto ci si mette a compilare
let volevaGiocare = false; // se l'accesso arriva da un tentativo di giocare
let ultimoPin = null;      // solo in memoria: serve per attivare la biometria
                           // subito dopo l'accesso, senza richiedere il PIN
let pannello = 'form';     // form | codice | recupero | profilo | nobackend
let notificheChieste = false; // già mostrata in questa sessione: non si insiste
let emailVerificata = false; // una volta accertato che l'email c'è, non si
                             // richiede più: "Rigioca" deve partire subito,
                             // senza una chiamata di rete davanti

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

  $('install-ora').addEventListener('click', async () => {
    const b = $('install-ora');
    b.disabled = true;
    const messa = await chiediInstallazione();
    b.disabled = false;
    if (!messa) preparaSchermataInstallazione();
  });
  $('install-copia').addEventListener('click', async () => {
    const b = $('install-copia');
    try {
      await navigator.clipboard.writeText(location.origin + location.pathname);
      b.textContent = 'Link copiato: incollalo nel browser';
    } catch (e) {
      b.textContent = location.host;
    }
    setTimeout(() => { b.textContent = 'Copia il link'; }, 3000);
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
    emailVerificata = false;
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

  $('tab-lb-sempre').addEventListener('click', () => cambiaTabClassifica('sempre'));
  $('tab-lb-sett').addEventListener('click', () => cambiaTabClassifica('settimana'));

  $('btn-delete').addEventListener('click', cancellaAccount);
  $('link-recupero').addEventListener('click', (e) => { e.preventDefault(); mostraRecupero(); });
  $('btn-recupero-annulla').addEventListener('click', () => { pannello = 'form'; openAuth(); });
  $('recupero-form').addEventListener('submit', inviaRecupero);
  $('dati-form').addEventListener('submit', salvaDati);
  $('email-form').addEventListener('submit', salvaEmailMancante);
  $('notifiche-attiva').addEventListener('click', () => rispostaNotifiche(true));
  $('notifiche-dopo').addEventListener('click', () => rispostaNotifiche(false));
  $('notifiche-si').addEventListener('click', attivaNotifiche);
  $('notifiche-no').addEventListener('click', () => {
    $('invito-notifiche').classList.add('hidden');
    // segnato come già chiesto: non lo riproponiamo a ogni partita
    try { localStorage.setItem('beeppy.push.chiesto', '1'); } catch (e) { /* niente */ }
  });
  $('btn-notifiche').addEventListener('click', cambiaNotifiche);
  $('btn-notifiche-prova').addEventListener('click', async () => {
    const b = $('btn-notifiche-prova');
    const nota = $('notifiche-nota');
    b.disabled = true;
    const out = await push.prova();
    b.disabled = false;
    if (!out.ok) {
      nota.textContent = out.error;
      nota.classList.remove('hidden');
    }
  });
  $('avatar-scegli').addEventListener('click', () => $('avatar-file').click());
  $('avatar-file').addEventListener('change', scegliFoto);
  $('avatar-rimuovi').addEventListener('click', togliFoto);
  $('btn-codice-fatto').addEventListener('click', () => {
    pannello = 'form';
    closeModal('modal-auth');
    dopoAccesso();
  });
  $('btn-copia-codice').addEventListener('click', async () => {
    const b = $('btn-copia-codice');
    try {
      await navigator.clipboard.writeText($('codice-valore').textContent);
      b.textContent = 'Copiato';
    } catch (e) {
      b.textContent = 'Selezionalo e copialo a mano';
    }
    setTimeout(() => { b.textContent = 'Copia il codice'; }, 2500);
  });
  $('r-codice').addEventListener('input', () => {
    // maiuscole e trattini automatici, così il codice si scrive come si legge
    const grezzo = $('r-codice').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
    $('r-codice').value = (grezzo.match(/.{1,4}/g) || []).join('-');
  });
  $('r-pin').addEventListener('input', () => {
    $('r-pin').value = $('r-pin').value.replace(/[^0-9]/g, '').slice(0, net.PIN_MAX);
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

  initInstall();
  mostraAnnuncio();
  controllaInstallazione();
  syncAccountChip();
  syncLoginNote();
  showScreen('menu');
  refreshMenu();
}

// Per giocare serve un account, senza eccezioni: così ogni punteggio ha un
// proprietario e la classifica non si riempie di partite anonime. Se la
// classifica online non è configurata non si gioca, e la schermata di accesso
// spiega cosa manca.
async function startGame() {
  // Senza questa attesa, nei primi istanti dopo l'apertura un utente già
  // registrato si vedrebbe chiedere di registrarsi: la sessione salvata viene
  // ripristinata in modo asincrono.
  await net.whenReady();

  // Chi si è iscritto prima che l'email fosse obbligatoria la inserisce ora.
  // Il controllo sta qui e non nel database perché non è una questione di
  // sicurezza ma di completezza dei dati: bloccare l'invio del punteggio lato
  // server sembrerebbe un guasto a chi gioca.
  if (net.state.user && !emailVerificata) {
    if (await net.mancaEmail()) {
      mostraChiediEmail();
      return;
    }
    emailVerificata = true;
  }

  // Consenso alle notifiche: si chiede prima di giocare, una volta per sessione.
  if (net.state.user && !notificheChieste && await deveChiedereNotifiche()) {
    notificheChieste = true;
    await mostraChiediNotifiche();
    return;
  }

  if (!net.state.user) {
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
  for (const id of ['screen-menu', 'screen-ready', 'screen-over', 'screen-install',
                    'screen-email', 'screen-notifiche']) {
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
  $('over-top-row').classList.add('hidden');
  $('over-inseguimento').classList.add('hidden');
  $('record-badge').classList.add('hidden');
  $('over-status').textContent = net.state.user ? 'Invio del punteggio...' : '';

  proponiNotifiche();
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
    await mostraContestoClassifica();
  }
  refreshMenu();
}

// Posizione, migliore in assoluto e distanza da chi ti precede: tutto da una
// sola lettura della classifica, perché sono tre risposte alla stessa domanda.
// La riga dell'inseguimento è quella che fa premere "Rigioca", quindi deve
// essere esatta: si scrive solo con i numeri che il server ha accettato.
async function mostraContestoClassifica() {
  const rank = $('over-rank');
  const topRow = $('over-top-row');
  const caccia = $('over-inseguimento');
  topRow.classList.add('hidden');
  caccia.classList.add('hidden');
  if (!net.state.user) { rank.textContent = '-'; return; }

  const { ok, rows } = await net.leaderboard(100);
  if (!ok || !rows.length) { rank.textContent = '-'; return; }

  $('over-top').textContent = rows[0].best_score;
  topRow.classList.remove('hidden');

  const i = rows.findIndex((r) => r.user_id === net.state.user.id);
  if (i < 0) {
    // fuori dai primi cento: la posizione esatta non la conosciamo
    rank.textContent = 'oltre la 100a';
    caccia.innerHTML = `In testa c'è <b>${escapeHtml(rows[0].nickname)}</b> con ${rows[0].best_score}.`;
    caccia.classList.remove('hidden');
    return;
  }

  rank.textContent = `#${rows[i].pos}`;
  if (i === 0) {
    caccia.innerHTML = rows.length > 1
      ? `Sei in testa, ${rows[0].best_score - rows[1].best_score} punti sopra <b>${escapeHtml(rows[1].nickname)}</b>.`
      : 'Sei in testa alla classifica.';
  } else {
    const sopra = rows[i - 1];
    // a pari punti la differenza è zero, ma per passarlo serve comunque un punto
    const mancano = Math.max(1, sopra.best_score - rows[i].best_score + 1);
    caccia.innerHTML = `Ti mancano <b>${mancano}</b> ${mancano === 1 ? 'punto' : 'punti'} ` +
                       `per superare <b>${escapeHtml(sopra.nickname)}</b>.`;
  }
  caccia.classList.remove('hidden');
}

// ---------------------------------------------------------------- classifica
// Due classifiche: quella di sempre e quella degli ultimi sette giorni. La
// seconda esiste per chi arriva dopo — quando in cima ci saranno record alti,
// una classifica che riparte è l'unica in cui un nuovo iscritto può ancora
// sperare di arrivare primo.
let lbTab = 'sempre';
// Diventa vero se il database non ha ancora la funzione settimanale: da quel
// momento la linguetta non ricompare più, invece di riapparire a ogni apertura
// per poi sparire di nuovo al primo clic.
let settimanaAssente = false;

async function openLeaderboard() {
  await net.whenReady();
  // La classifica è riservata a chi ha un account. Non è un capriccio
  // dell'interfaccia: le tabelle sono chiuse agli anonimi, quindi qui possiamo
  // solo evitare di mostrare un errore al posto di una spiegazione.
  if (net.state.online && !net.state.user) {
    volevaGiocare = false;
    openAuth(giaConosciuto() ? 'Accedi per vedere la classifica'
                             : 'Registrati per vedere la classifica',
             modoPredefinito());
    return;
  }

  openModal('modal-lb');
  await mostraClassifica();
}

async function mostraClassifica() {
  const list = $('lb-list');
  const note = $('lb-note');
  const tabs = $('lb-tabs');
  const settimana = lbTab === 'settimana';
  list.innerHTML = '<li class="lb-empty">Carico...</li>';
  note.textContent = '';
  $('tab-lb-sempre').classList.toggle('is-on', !settimana);
  $('tab-lb-sett').classList.toggle('is-on', settimana);

  if (!net.state.online) {
    tabs.classList.add('hidden');
    list.innerHTML = `<li class="lb-empty">Classifica online non configurata.<br>Il tuo record locale: <b>${net.localBest()}</b></li>`;
    return;
  }

  const out = settimana ? await net.leaderboardSettimana(50) : await net.leaderboard(50);

  // Funzione non ancora installata sul database: invece di mostrare un guasto
  // si torna alla classifica di sempre e si nasconde la linguetta.
  if (!out.ok && out.assente && settimana) {
    settimanaAssente = true;
    lbTab = 'sempre';
    return mostraClassifica();
  }
  if (!out.ok) {
    list.innerHTML = `<li class="lb-empty">${escapeHtml(out.error)}</li>`;
    return;
  }
  tabs.classList.toggle('hidden', settimanaAssente);

  const rows = out.rows;
  if (!rows.length) {
    list.innerHTML = settimana
      ? '<li class="lb-empty">Questa settimana non ha ancora giocato nessuno.<br>Il primo posto è libero.</li>'
      : '<li class="lb-empty">Nessun punteggio ancora.<br>Il primo record puoi essere tu.</li>';
    return;
  }
  const medal = ['🥇', '🥈', '🥉'];
  list.innerHTML = rows
    .map((r, i) => {
      const me = net.state.user && r.user_id === net.state.user.id;
      const pos = i < 3 ? medal[i] : r.pos;
      const foto = net.avatarUrl(r.user_id, r.avatar_at);
      const img = foto ? `<img class="lb-foto" src="${foto}" alt="" loading="lazy">` : '';
      return `<li class="${me ? 'me' : ''}"><span class="pos">${pos}</span>` +
             `<span class="nick">${img}${escapeHtml(r.nickname)}</span>` +
             `<span class="pts">${r.best_score}</span></li>`;
    })
    .join('');

  const dentro = net.state.user && rows.some((r) => r.user_id === net.state.user.id);
  if (settimana && !dentro) {
    note.textContent = 'Non compari qui: conta la partita migliore degli ultimi sette giorni.';
  } else if (settimana) {
    note.textContent = 'Conta la partita migliore degli ultimi sette giorni.';
  } else if (net.state.user && !dentro) {
    note.textContent = 'Non sei ancora fra i primi 50.';
  } else if (!net.state.user) {
    note.textContent = 'Accedi per comparire in classifica.';
  }
}

function cambiaTabClassifica(quale) {
  if (lbTab === quale) return;
  lbTab = quale;
  mostraClassifica();
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

  // Un pannello alla volta, scelto qui e in nessun altro posto. La prima
  // versione lasciava che ogni pannello decidesse da sé se mostrarsi, e il
  // risultato era il recupero PIN e la scheda profilo visibili insieme.
  const attivo =
    pannello === 'codice'   ? 'auth-codice'
    : pannello === 'recupero' ? 'auth-recupero'
    : !configurato          ? 'auth-nobackend'
    : logged                ? 'auth-logged'
    : 'auth-forms';

  for (const id of ['auth-forms', 'auth-recupero', 'auth-codice', 'auth-logged', 'auth-nobackend']) {
    $(id).classList.toggle('hidden', id !== attivo);
  }
  $('auth-error').classList.add('hidden');
  if (attivo === 'auth-codice') {
    $('auth-title').textContent = 'Salva questo codice';
  } else if (attivo === 'auth-recupero') {
    $('auth-title').textContent = 'PIN dimenticato';
  } else if (attivo === 'auth-logged') {
    $('auth-title').textContent = 'Il tuo profilo';
    riempiProfilo();
    resetCancellazione();
  } else if (attivo === 'auth-nobackend') {
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
  $('campi-registrazione').classList.toggle('hidden', mode !== 'signup');
  $('f-email').required = mode === 'signup';
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
  const eraRegistrazione = authMode === 'signup';
  const contatti = {
    email: $('f-email').value,
    nome: $('f-nome').value,
    cognome: $('f-cognome').value,
    telefono: $('f-telefono').value,
  };
  const out = eraRegistrazione
    ? await net.signUp(nick, pin, contatti, guard)
    : await net.signIn(nick, pin);

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
  for (const id of ['f-email', 'f-nome', 'f-cognome', 'f-telefono']) $(id).value = '';
  err.textContent = '';   // altrimenti resta scritto l'errore del tentativo prima

  // Chi si è appena registrato riceve il codice di recupero, una volta sola.
  // È l'unico momento in cui possiamo darglielo: dopo, sul server c'è solo
  // la sua impronta.
  if (eraRegistrazione) {
    const codice = net.generaCodiceRecupero();
    const salvato = await net.salvaCodiceRecupero(codice);
    if (salvato.ok) {
      $('codice-valore').textContent = codice;
      pannello = 'codice';
      openAuth();
      return;
    }
    // se il salvataggio fallisce (funzione non ancora installata) non blocchiamo
    // l'accesso: si gioca lo stesso, semplicemente senza rete di recupero
  }
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

// Se l'amministratore ha acceso l'obbligo di installazione e il gioco non è
// aperto dalla schermata Home, si mostra la procedura al posto del menu.
//
// Regola importante: in caso di dubbio si LASCIA GIOCARE. Se la lettura della
// configurazione fallisce (rete assente, database in pausa) nessuno deve
// ritrovarsi chiuso fuori da un gioco per un problema che non lo riguarda.
async function controllaInstallazione() {
  if (isStandalone()) return;
  let cfg;
  try {
    cfg = await net.leggiConfig();
  } catch (e) {
    return; // in dubbio, si gioca
  }
  if ((cfg.richiedi_installazione || 'no') !== 'si') return;

  preparaSchermataInstallazione();
  showScreen('install');

  // se il browser annuncia la possibilità di installare mentre la schermata è
  // già aperta, il pulsante compare senza dover ricaricare
  window.addEventListener('beforeinstallprompt', () => {
    if ($('screen-install').classList.contains('is-on')) preparaSchermataInstallazione();
  });
  window.addEventListener('appinstalled', () => location.reload());
}

function mostraChiediEmail() {
  $('email-errore').classList.add('hidden');
  showScreen('email');
  setTimeout(() => $('e-email').focus(), 150);
}

async function salvaEmailMancante(e) {
  e.preventDefault();
  const err = $('email-errore');
  const btn = $('email-salva');
  err.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Salvo...';

  const out = await net.salvaContatti({
    email: $('e-email').value,
    nome: $('e-nome').value,
    cognome: $('e-cognome').value,
  });

  btn.disabled = false;
  btn.textContent = 'Salva e gioca';
  if (!out.ok) {
    err.textContent = out.error;
    err.classList.remove('hidden');

    // Se il salvataggio è impossibile per un permesso mancante sul database,
    // la colpa non è di chi sta giocando: tenerlo chiuso fuori sarebbe punirlo
    // per un errore di chi ha pubblicato. Si sblocca e si gioca, il dato lo si
    // chiederà la prossima volta.
    if (/permesso mancante|row-level/i.test(out.error)) {
      console.warn('[beeppy] contatti non salvabili: schema non aggiornato. Sblocco il gioco.');
      emailVerificata = true;
      setTimeout(() => {
        showScreen('none');
        game.arm();
        showScreen('ready');
      }, 2500);
    }
    return;
  }
  // salvata: si gioca subito, senza far ripassare dal menu
  emailVerificata = true;
  showScreen('none');
  game.arm();
  showScreen('ready');
}

// Al ritorno al menu ricontrolliamo: se l'email manca ancora, la si chiede
// prima che tocchi Gioca, così non scopre l'ostacolo a metà strada.
async function controllaEmailAlMenu() {
  if (!net.state.user || emailVerificata) return;
  if (await net.mancaEmail()) mostraChiediEmail();
  else emailVerificata = true;
}

// L'annuncio lo scrive l'amministratore dalla sua pagina, e compare nel menu
// a tutti i giocatori.
async function mostraAnnuncio() {
  const cfg = await net.leggiConfig();
  const el = $('annuncio');
  const testo = (cfg.annuncio || '').trim();
  el.textContent = testo;
  el.classList.toggle('hidden', !testo);
}

function mostraRecupero() {
  pannello = 'recupero';
  $('r-nick').value = $('f-nick').value || net.localNick() || '';
  $('r-codice').value = '';
  $('r-pin').value = '';
  $('recupero-errore').classList.add('hidden');
  openAuth();
}

async function inviaRecupero(e) {
  e.preventDefault();
  const err = $('recupero-errore');
  const btn = $('recupero-submit');
  err.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Attendi...';

  const out = await net.recuperaPin($('r-nick').value, $('r-codice').value, $('r-pin').value);

  btn.disabled = false;
  btn.textContent = 'Rimetti il PIN';
  if (!out.ok) {
    err.textContent = out.error;
    err.classList.remove('hidden');
    return;
  }
  // PIN rimesso: entriamo subito, senza far ridigitare nulla
  const nick = $('r-nick').value.trim();
  const pin = $('r-pin').value;
  const acc = await net.signIn(nick, pin);
  pannello = 'form';
  if (!acc.ok) {
    err.textContent = 'PIN aggiornato, ora accedi con il nuovo PIN.';
    err.classList.remove('hidden');
    openAuth();
    return;
  }
  ultimoPin = pin;
  dopoAccesso();
}

// Cancellazione dell'account: due passaggi voluti. Il primo click cambia il
// pulsante in una conferma che dice cosa si perde; solo il secondo cancella.
// Nessuna finestra di sistema: su mobile i confirm() nativi si toccano per
// sbaglio, e questa è l'azione meno reversibile dell'app.
let cancellaArmato = false;

function resetCancellazione() {
  cancellaArmato = false;
  const b = $('btn-delete');
  b.textContent = 'Cancella l\'account';
  b.classList.remove('conferma');
  b.disabled = false;
}

async function cancellaAccount() {
  const b = $('btn-delete');
  const nota = $('bio-note');
  if (!cancellaArmato) {
    cancellaArmato = true;
    b.textContent = 'Confermi? Perdi record e classifica';
    b.classList.add('conferma');
    // se ci ha ripensato e non tocca più nulla, torna come prima
    setTimeout(() => {
      if (cancellaArmato) resetCancellazione();
    }, 6000);
    return;
  }
  b.disabled = true;
  b.textContent = 'Cancello...';
  const out = await net.deleteAccount();
  if (!out.ok) {
    resetCancellazione();
    nota.textContent = out.error;
    nota.classList.remove('hidden');
    return;
  }
  bio.forget();
  ultimoPin = null;
  resetCancellazione();
  closeModal('modal-auth');
  syncAccountChip();
  game.toMenu();
  showScreen('menu');
  refreshMenu();
}

// ------------------------------------------- consenso prima di giocare
//
// La schermata si mostra solo a chi PUÒ ancora decidere. Chi ha già negato il
// permesso non la vede: il browser non riproporrebbe la finestra, quindi
// sbarrargli la strada significherebbe escluderlo per sempre da un gioco a cui
// è iscritto. Stessa cosa per chi apre da Safari senza aver installato Beeppy,
// che su iPhone non può ricevere notifiche in nessun caso.
async function deveChiedereNotifiche() {
  if (!push.supportate()) return false;
  if (push.permesso() !== 'default') return false;   // già deciso, in un senso o nell'altro
  if (await push.giaIscritto()) return false;
  return true;
}

async function mostraChiediNotifiche() {
  $('notifiche-esito').textContent = '';
  let obbligatorie = false;
  try {
    const cfg = await net.leggiConfig();
    obbligatorie = (cfg.notifiche_obbligatorie || 'no') === 'si';
  } catch (e) { /* in dubbio si lascia la via d'uscita */ }
  $('notifiche-dopo').classList.toggle('hidden', obbligatorie);
  showScreen('notifiche');
}

async function rispostaNotifiche(attiva) {
  const btn = $('notifiche-attiva');
  const esito = $('notifiche-esito');
  if (!attiva) {
    showScreen('none');
    game.arm();
    showScreen('ready');
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Attendi...';
  const out = await push.attiva();
  btn.disabled = false;
  btn.textContent = 'Attiva le notifiche';
  if (!out.ok) {
    // Ha detto di no, o qualcosa è andato storto: si gioca lo stesso. Tenerlo
    // fermo qui non servirebbe a niente, perché la finestra del permesso non
    // ricomparirà più.
    esito.textContent = out.error + ' Si gioca lo stesso.';
    setTimeout(() => {
      showScreen('none');
      game.arm();
      showScreen('ready');
    }, 2200);
    return;
  }
  showScreen('none');
  game.arm();
  showScreen('ready');
}

// ---------------------------------------------------------- notifiche
//
// L'invito compare a fine partita e non all'apertura: chiedere il permesso
// appena si entra è il modo più sicuro per farselo negare, e dopo un rifiuto
// il browser non lo richiede più. A fine partita, invece, il momento ha senso
// e la domanda si spiega da sé.
const CHIAVE_PARTITE = 'beeppy.partiteGiocate';

function partiteGiocate() {
  try {
    return Number(localStorage.getItem(CHIAVE_PARTITE) || 0);
  } catch (e) {
    return 0;
  }
}

function proponiNotifiche() {
  const n = partiteGiocate() + 1;
  try { localStorage.setItem(CHIAVE_PARTITE, String(n)); } catch (e) { /* niente */ }

  // Alla seconda partita per chi arriva adesso: alla prima sta ancora capendo
  // cos'è il gioco, e una richiesta di permesso in quel momento si becca un no.
  // Subito, invece, per chi ha già un record: quello il gioco lo conosce già, e
  // fargli aspettare un'altra partita è solo tempo perso.
  const giaGiocatore = net.state.best > 0;
  const mostra = (n >= 2 || giaGiocatore) && net.state.user &&
                 push.haSensoProporle(isStandalone());
  $('invito-notifiche').classList.toggle('hidden', !mostra);

  // A chi gioca da prima spieghiamo anche perché gliela stiamo chiedendo ora
  if (mostra && giaGiocatore) {
    $('invito-notifiche').querySelector('p').textContent =
      'Novità: ti avviso quando qualcuno ti supera in classifica. Lo attivo?';
  }
}

async function attivaNotifiche() {
  const box = $('invito-notifiche');
  const btn = $('notifiche-si');
  btn.disabled = true;
  btn.textContent = 'Attendi...';
  const out = await push.attiva();
  btn.disabled = false;
  btn.textContent = 'Sì, avvisami';
  box.classList.add('hidden');
  if (!out.ok) {
    $('over-status').textContent = out.error;
  } else {
    $('over-status').textContent = 'Ti avviserò quando qualcuno ti supera.';
  }
}

// Interruttore nel profilo, per chi cambia idea in un senso o nell'altro.
async function syncNotifiche() {
  const btn = $('btn-notifiche');
  const nota = $('notifiche-nota');
  btn.classList.add('hidden');
  $('btn-notifiche-prova').classList.add('hidden');
  nota.classList.add('hidden');

  if (!push.supportate()) {
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    nota.textContent = iOS && !isStandalone()
      ? 'Le notifiche su iPhone arrivano solo se aggiungi Beeppy alla schermata Home.'
      : 'Le notifiche non sono disponibili su questo dispositivo.';
    nota.classList.remove('hidden');
    return;
  }
  const attive = await push.giaIscritto();
  btn.textContent = attive ? 'Disattiva le notifiche' : 'Attiva le notifiche';
  btn.dataset.attive = attive ? 'si' : 'no';
  btn.classList.remove('hidden');
  $('btn-notifiche-prova').classList.remove('hidden');
  if (push.permesso() === 'denied') {
    nota.textContent = 'Le hai rifiutate: per riattivarle servono le impostazioni del telefono.';
    nota.classList.remove('hidden');
    btn.classList.add('hidden');
  }
}

async function cambiaNotifiche() {
  const btn = $('btn-notifiche');
  const nota = $('notifiche-nota');
  btn.disabled = true;
  const out = btn.dataset.attive === 'si' ? await push.disattiva() : await push.attiva();
  btn.disabled = false;
  if (!out.ok) {
    nota.textContent = out.error;
    nota.classList.remove('hidden');
  }
  syncNotifiche();
}

// ------------------------------------------------------------- profilo

// Avatar: la stessa ape del gioco, con la tinta ricavata dal nickname. Così
// ognuno ha la sua senza caricare nessuna immagine, e resta coerente con la
// scelta di non avere asset esterni.
function tintaDaNickname(nick) {
  let h = 2166136261;
  for (let i = 0; i < nick.length; i++) {
    h ^= nick.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 360;
}

function disegnaAvatar(nick) {
  const c = $('profilo-avatar');
  if (!c) return;
  const x = c.getContext('2d');
  const tinta = tintaDaNickname(nick || 'ape');
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.clearRect(0, 0, c.width, c.height);

  // cielo dell'avatar, con la tinta del giocatore
  const g = x.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, `hsl(${tinta} 70% 72%)`);
  g.addColorStop(1, `hsl(${(tinta + 28) % 360} 62% 52%)`);
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, c.height);

  // un paio di granelli di polline, come nel gioco
  x.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 5; i++) {
    const px = ((tinta * (i + 3)) % 130) + 10;
    const py = ((tinta * (i + 7)) % 130) + 10;
    x.beginPath();
    x.arc(px, py, 2 + (i % 3), 0, 7);
    x.fill();
  }

  x.translate(c.width / 2, c.height / 2 + 4);
  x.scale(1.55, 1.55);
  drawBee(x, 0, 0, -0.22, 1.4);
}

// Se c'è una foto si mostra quella, altrimenti resta l'ape disegnata: nessuno
// deve ritrovarsi con un quadrato vuoto solo perché non ha caricato niente.
function mostraAvatar() {
  const nick = net.state.user ? net.state.user.nickname : '';
  const url = net.state.user ? net.avatarUrl(net.state.user.id, net.state.avatarAt) : null;
  const foto = $('profilo-foto');
  const disegno = $('profilo-avatar');
  if (url) {
    foto.src = url;
    foto.classList.remove('hidden');
    disegno.classList.add('hidden');
    $('avatar-rimuovi').classList.remove('hidden');
  } else {
    foto.classList.add('hidden');
    disegno.classList.remove('hidden');
    $('avatar-rimuovi').classList.add('hidden');
    disegnaAvatar(nick);
  }
}

async function scegliFoto(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const esito = $('dati-esito');
  esito.textContent = 'Carico la foto...';
  const out = await net.caricaAvatar(file);
  esito.textContent = out.ok ? 'Foto aggiornata.' : out.error;
  if (out.ok) mostraAvatar();
}

async function togliFoto() {
  const esito = $('dati-esito');
  esito.textContent = 'Rimuovo...';
  const out = await net.rimuoviAvatar();
  esito.textContent = out.ok ? 'Foto rimossa.' : out.error;
  mostraAvatar();
}

function formattaNumero(n) {
  return (n || 0).toLocaleString('it-IT');
}

function formattaDistanza(punti) {
  // ogni tronco superato sono 300 unità di mondo; 100 unità = 1 metro
  const metri = Math.round((punti || 0) * 3);
  if (metri < 1000) return metri + ' m';
  return (metri / 1000).toFixed(1).replace('.', ',') + ' km';
}

const TRAGUARDI = [
  { testo: '🌱 Primo volo', ok: (s) => s.partite >= 1 },
  { testo: '🐝 10 punti', ok: (s) => s.record >= 10 },
  { testo: '🍯 25 punti', ok: (s) => s.record >= 25 },
  { testo: '👑 50 punti', ok: (s) => s.record >= 50 },
  { testo: '🚀 100 punti', ok: (s) => s.record >= 100 },
  { testo: '💪 50 partite', ok: (s) => s.partite >= 50 },
  { testo: '🔥 500 partite', ok: (s) => s.partite >= 500 },
  { testo: '🥇 Primo in classifica', ok: (s) => s.posizione === 1 },
];

async function riempiProfilo() {
  const nick = net.state.user ? net.state.user.nickname : '';
  $('auth-nick').textContent = nick;
  mostraAvatar();

  // valori provvisori mentre arrivano i dati veri
  $('auth-best').textContent = net.state.best;
  $('profilo-posizione').textContent = 'carico la posizione...';
  for (const id of ['profilo-partite', 'profilo-battiti', 'profilo-distanza']) $(id).textContent = '–';

  const st = await net.myStats();
  if (!st.ok) {
    $('profilo-posizione').textContent = st.error;
    return;
  }
  $('auth-best').textContent = st.record;
  $('profilo-posizione').textContent = st.posizione
    ? `${st.posizione}° su ${st.giocatori} in classifica`
    : 'ancora fuori classifica: fai almeno un punto';
  $('profilo-partite').textContent = formattaNumero(st.partite);
  $('profilo-battiti').textContent = formattaNumero(st.battiti);
  $('profilo-distanza').textContent = formattaDistanza(st.record);
  if (st.iscrittoDal) {
    const d = new Date(st.iscrittoDal);
    $('profilo-dal').textContent = 'nell\'alveare dal ' +
      d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  $('profilo-traguardi').innerHTML = TRAGUARDI
    .map((t) => `<span class="traguardo ${t.ok(st) ? 'preso' : ''}">${t.testo}</span>`)
    .join('');

  riempiStorico(st.record);
  riempiDati();
  syncNotifiche();
}

async function riempiDati() {
  const esito = $('dati-esito');
  esito.textContent = '';
  const { ok, dati } = await net.miContatti();
  if (!ok || !dati) {
    // succede se lo schema aggiornato non è ancora stato eseguito
    esito.textContent = '';
    riassumiDati('');
    return;
  }
  $('d-email').value = dati.email || '';
  $('d-nome').value = dati.nome || '';
  $('d-cognome').value = dati.cognome || '';
  $('d-telefono').value = dati.telefono || '';
  riassumiDati(dati.email || '');
}

// La sezione resta chiusa se i dati ci sono già, e mostra l'email nel titolo
// così si vede a colpo d'occhio che è a posto. Se manca si apre da sola: è
// l'unico dato obbligatorio, nasconderlo dietro un clic sarebbe un dispetto.
// `chiudi` è falso dopo un salvataggio: richiudere la sezione nasconderebbe il
// "Dati salvati." un istante dopo averlo scritto.
function riassumiDati(email, chiudi = true) {
  const box = $('profilo-dati');
  const riassunto = $('dati-riassunto');
  if (email) {
    riassunto.textContent = email;
    riassunto.classList.remove('manca');
    if (chiudi) box.open = false;
  } else {
    riassunto.textContent = 'manca l\'email';
    riassunto.classList.add('manca');
    box.open = true;
  }
}

async function salvaDati(e) {
  e.preventDefault();
  const b = $('dati-salva');
  const esito = $('dati-esito');
  b.disabled = true;
  b.textContent = 'Salvo...';
  const out = await net.salvaContatti({
    email: $('d-email').value,
    nome: $('d-nome').value,
    cognome: $('d-cognome').value,
    telefono: $('d-telefono').value,
  });
  b.disabled = false;
  b.textContent = 'Salva i dati';
  esito.textContent = out.ok ? 'Dati salvati.' : out.error;
  if (out.ok) riassumiDati($('d-email').value.trim(), false);
}

// Ultime partite: un grafico a barre e l'elenco. Se la tabella non c'è ancora
// (SQL non eseguito) la sezione resta semplicemente nascosta.
async function riempiStorico(record) {
  const box = $('profilo-storico');
  const { ok, rows } = await net.myGames(10);
  if (!ok || !rows.length) {
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');

  const cronologiche = rows.slice().reverse(); // dalla più vecchia alla più recente
  const massimo = Math.max(1, ...cronologiche.map((r) => r.score));
  $('storico-grafico').innerHTML = cronologiche
    .map((r) => {
      const h = Math.max(4, Math.round((r.score / massimo) * 100));
      const suo = r.score === record && record > 0 ? ' record' : '';
      return `<div class="storico-barra${suo}" style="height:${h}%" title="${r.score} punti"></div>`;
    })
    .join('');

  $('storico-lista').innerHTML = rows
    .slice(0, 5)
    .map((r) => `<li><b>${r.score}</b><span class="storico-quando">${quando(r.created_at)}</span></li>`)
    .join('');
}

// "3 minuti fa", "ieri", "il 28 agosto": più leggibile di una data intera
function quando(iso) {
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'adesso';
  if (min < 60) return `${min} min fa`;
  const ore = Math.round(min / 60);
  if (ore < 24) return `${ore} ${ore === 1 ? 'ora' : 'ore'} fa`;
  const giorni = Math.round(ore / 24);
  if (giorni === 1) return 'ieri';
  if (giorni < 7) return `${giorni} giorni fa`;
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
}

function dopoAccesso() {
  syncAccountChip();
  refreshMenu();
  controllaEmailAlMenu();
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
  const serve = !net.state.user;
  const noto = giaConosciuto();
  $('login-note').classList.toggle('hidden', !serve);
  $('login-note').textContent = noto
    ? `Bentornato: accedi come ${noto} per giocare e tornare in classifica.`
    : 'Per giocare serve un account: il nickname è il nome che finisce in classifica.';
  $('btn-play').textContent = serve ? (noto ? 'Accedi e gioca' : 'Registrati e gioca') : 'Gioca';
}

async function refreshMenu() {
  // Niente punteggi a chi non ha fatto l'accesso: né il proprio record né il
  // migliore in assoluto. Il riquadro non resta vuoto, sparisce.
  const dentro = Boolean(net.state.user) || !net.state.online;
  const riquadri = document.querySelector('.stats-row');
  if (riquadri) riquadri.classList.toggle('hidden', !dentro);
  if (!dentro) return;

  $('menu-best').textContent = Math.max(net.state.best, net.localBest());
  if (!net.state.online) {
    $('menu-top').textContent = '-';
    return;
  }
  const { ok, rows } = await net.leaderboard(1);
  $('menu-top').textContent = ok && rows.length ? rows[0].best_score : '-';
}

export { refreshMenu, syncAccountChip };
