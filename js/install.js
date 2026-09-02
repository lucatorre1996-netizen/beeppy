// Installazione come app sulla schermata Home.
//
// Android e desktop: il browser offre l'evento beforeinstallprompt, quindi
// possiamo mostrare un vero pulsante "Installa".
// iOS: Safari non offre nessun prompt, l'unica via è Condividi > Aggiungi alla
// schermata Home. Lì l'unica cosa utile che possiamo fare è spiegarlo, e farlo
// nel momento giusto: dopo la prima partita, non appena si apre il gioco.

const LS_DISMISS = 'beeppy.installHintOff';
const LS_PLAYED = 'beeppy.played';

let deferredPrompt = null;

export function isStandalone() {
  return window.navigator.standalone === true ||
         window.matchMedia('(display-mode: standalone)').matches ||
         window.matchMedia('(display-mode: fullscreen)').matches;
}

export function isIOS() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) ||
         // iPad con iOS 13+ si dichiara "Macintosh": lo smaschera il touch
         (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

// I browser dentro altre app (Instagram, Facebook, ...) non hanno la voce
// "Aggiungi alla schermata Home": suggerirla sarebbe un giro a vuoto.
function isInAppBrowser() {
  return /FBAN|FBAV|Instagram|Line|Twitter|LinkedIn/i.test(navigator.userAgent);
}

export function markPlayed() {
  try {
    localStorage.setItem(LS_PLAYED, '1');
  } catch (e) { /* niente */ }
}

function hasPlayed() {
  try {
    return localStorage.getItem(LS_PLAYED) === '1';
  } catch (e) {
    return false;
  }
}

function dismissed() {
  try {
    return localStorage.getItem(LS_DISMISS) === '1';
  } catch (e) {
    return false;
  }
}

export function initInstall() {
  const box = document.getElementById('install-hint');
  const text = document.getElementById('install-text');
  const go = document.getElementById('install-go');
  const close = document.getElementById('install-close');
  if (!box) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();      // il banner lo mostriamo noi, nel nostro momento
    deferredPrompt = e;
  });

  window.addEventListener('appinstalled', () => {
    try {
      localStorage.setItem(LS_DISMISS, '1');
    } catch (err) { /* niente */ }
    box.classList.add('hidden');
  });

  go.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    const p = deferredPrompt;
    deferredPrompt = null;
    box.classList.add('hidden');
    p.prompt();
    await p.userChoice;
  });

  close.addEventListener('click', () => {
    box.classList.add('hidden');
    try {
      localStorage.setItem(LS_DISMISS, '1');
    } catch (e) { /* niente */ }
  });

  // testo giusto per la piattaforma
  if (deferredPrompt || !isIOS()) {
    text.textContent = 'Aggiungila alla schermata Home: si apre a schermo pieno, senza barre del browser, e funziona anche offline.';
    go.classList.remove('hidden');
  } else if (isInAppBrowser()) {
    text.innerHTML = 'Apri Beeppy in <b>Safari</b> per poterla aggiungere alla schermata Home.';
  } else {
    text.innerHTML = 'Tocca <b>Condividi</b> ' + shareIcon() + ' in basso, poi <b>Aggiungi alla schermata Home</b>.';
  }
}

function shareIcon() {
  return '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style="vertical-align:-2px">' +
    '<path d="M12 3l4 4h-3v8h-2V7H8l4-4z" fill="currentColor"/>' +
    '<path d="M5 12v7h14v-7h-2v5H7v-5H5z" fill="currentColor"/></svg>';
}

// ------------------------------------------------- installazione obbligatoria
//
// Le procedure sono diverse e nessuna vale per tutti, quindi la schermata si
// adatta a chi la guarda. Il caso che conta di più è il browser interno di
// WhatsApp o Instagram: da lì non si può installare niente, e senza istruzioni
// giuste una persona resta bloccata senza capire perché.
function dentroAltraApp() {
  return /FBAN|FBAV|Instagram|Line|Twitter|LinkedIn|WhatsApp|Snapchat/i.test(navigator.userAgent);
}

const ICONA_CONDIVIDI =
  '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">' +
  '<path d="M12 3l4 4h-3v8h-2V7H8l4-4z" fill="currentColor"/>' +
  '<path d="M5 12v7h14v-7h-2v5H7v-5H5z" fill="currentColor"/></svg>';
const ICONA_MENU =
  '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">' +
  '<circle cx="12" cy="5" r="1.9" fill="currentColor"/>' +
  '<circle cx="12" cy="12" r="1.9" fill="currentColor"/>' +
  '<circle cx="12" cy="19" r="1.9" fill="currentColor"/></svg>';

// Riempie la schermata con le istruzioni giuste. Ritorna true se ha trovato un
// percorso praticabile, false se da questo browser non si può proprio installare.
export function preparaSchermataInstallazione() {
  const passi = document.getElementById('install-istruzioni');
  const bottone = document.getElementById('install-ora');
  const copia = document.getElementById('install-copia');
  const nota = document.getElementById('install-nota');
  if (!passi) return true;

  bottone.classList.add('hidden');
  copia.classList.add('hidden');
  nota.textContent = '';

  // Caso peggiore: browser dentro un'altra app, dove non esiste nessuna voce
  // per aggiungere alla schermata Home.
  if (dentroAltraApp()) {
    passi.innerHTML =
      '<li>Tocca il menu ' + ICONA_MENU + ' in alto a destra</li>' +
      '<li>Scegli <b>Apri nel browser</b> (Safari su iPhone, Chrome su Android)</li>' +
      '<li>Da lì potrai aggiungere Beeppy alla schermata Home</li>';
    copia.classList.remove('hidden');
    nota.textContent = 'Stai usando il browser interno di un\'altra app: da qui l\'installazione non è possibile.';
    return false;
  }

  if (isIOS()) {
    passi.innerHTML =
      '<li>Tocca <b>Condividi</b> ' + ICONA_CONDIVIDI + ' nella barra in basso</li>' +
      '<li>Scorri e scegli <b>Aggiungi alla schermata Home</b></li>' +
      '<li>Apri Beeppy dall\'icona appena comparsa</li>';
    nota.textContent = 'Su iPhone serve Safari: è l\'unico browser che può farlo.';
    return true;
  }

  // Android e desktop: se il browser ce lo permette, un pulsante vero
  if (promptDisponibile()) {
    passi.innerHTML = '<li>Tocca <b>Installa ora</b> e conferma</li>';
    bottone.classList.remove('hidden');
    return true;
  }
  passi.innerHTML =
    '<li>Apri il menu ' + ICONA_MENU + ' del browser</li>' +
    '<li>Scegli <b>Installa app</b> oppure <b>Aggiungi a schermata Home</b></li>';
  nota.textContent = 'Se non trovi la voce, prova ad aprire Beeppy con Chrome.';
  return true;
}

export function promptDisponibile() {
  return Boolean(deferredPrompt);
}

export async function chiediInstallazione() {
  if (!deferredPrompt) return false;
  const p = deferredPrompt;
  deferredPrompt = null;
  p.prompt();
  const scelta = await p.userChoice;
  return scelta && scelta.outcome === 'accepted';
}

// Va chiamata quando si torna al menu: mostra l'invito solo a chi ha già
// giocato almeno una volta, non lo ha rifiutato e non ha già installato.
export function maybeShowInstallHint() {
  const box = document.getElementById('install-hint');
  if (!box) return;
  const mostra = !isStandalone() && !dismissed() && hasPlayed() &&
                 (Boolean(deferredPrompt) || isIOS());
  box.classList.toggle('hidden', !mostra);
}
