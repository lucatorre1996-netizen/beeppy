// Notifiche push.
//
// Dove funzionano: su Android in ogni caso; su iPhone SOLO se il gioco è stato
// aggiunto alla schermata Home (da iOS 16.4 in poi). Dal browser di iPhone non
// arriveranno mai, e non è una nostra mancanza: è come funziona iOS.
//
// Il permesso si chiede una volta sola e nel momento giusto. Chiederlo appena
// si apre il gioco è il modo più sicuro per farselo negare per sempre: dopo un
// "no" il browser non lo richiede più, e non c'è modo di tornare indietro se
// non dalle impostazioni di sistema.

import { VAPID_PUBLIC_KEY, PUSH_ATTIVE } from './config.js';
import * as net from './net.js';

const LS_CHIESTO = 'beeppy.push.chiesto';

function base64ToUint8(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function supportate() {
  return PUSH_ATTIVE && 'serviceWorker' in navigator && 'PushManager' in window &&
         'Notification' in window && window.isSecureContext;
}

export function permesso() {
  return supportate() ? Notification.permission : 'unsupported';
}

// Già chiesto una volta? Non lo richiediamo: sarebbe insistenza inutile,
// perché dopo un rifiuto il browser non mostra più nulla.
export function giaChiesto() {
  try {
    return localStorage.getItem(LS_CHIESTO) === '1' || permesso() !== 'default';
  } catch (e) {
    return false;
  }
}

function segnaChiesto() {
  try {
    localStorage.setItem(LS_CHIESTO, '1');
  } catch (e) { /* niente */ }
}

export async function giaIscritto() {
  if (!supportate()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    return Boolean(await reg.pushManager.getSubscription());
  } catch (e) {
    return false;
  }
}

// Chiede il permesso e registra l'iscrizione. Da chiamare SOLO dentro un gesto
// dell'utente: i browser rifiutano la richiesta se arriva da sola.
export async function attiva() {
  if (!supportate()) return { ok: false, error: 'Le notifiche non sono disponibili qui.' };
  segnaChiesto();
  try {
    const esito = await Notification.requestPermission();
    if (esito !== 'granted') {
      return { ok: false, error: esito === 'denied'
        ? 'Notifiche rifiutate. Per riattivarle servono le impostazioni del telefono.'
        : 'Notifiche non attivate.' };
    }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,          // obbligatorio: niente notifiche invisibili
        applicationServerKey: base64ToUint8(VAPID_PUBLIC_KEY),
      });
    }
    const salvata = await net.salvaIscrizionePush(sub.toJSON());
    if (!salvata.ok) return salvata;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'Non è stato possibile attivare le notifiche.' };
  }
}

// Chiede il permesso e basta, senza iscrivere. Serve alla registrazione: lì
// l'iscrizione non si potrebbe ancora salvare, perché l'account non esiste, ma
// il permesso va chiesto PRIMA di creare l'account. Altrimenti chi rifiuta si
// ritroverebbe con un account che non può usare, e noi con una riga in più nel
// database che non serve a nessuno.
//
// `esente: true` distingue "ha detto di no" da "non gliel'abbiamo nemmeno
// potuto chiedere" (iPhone non installato, browser senza push, pagina non
// sicura). Sono due cose diverse e vanno trattate in modo diverso: la prima è
// una risposta, la seconda un limite del dispositivo.
export async function chiediPermesso() {
  if (!supportate()) return { ok: false, esente: true, motivo: 'non_disponibili' };
  if (Notification.permission === 'granted') return { ok: true };
  if (Notification.permission === 'denied') return { ok: false, motivo: 'negato' };
  segnaChiesto();
  try {
    const esito = await Notification.requestPermission();
    if (esito === 'granted') return { ok: true };
    return { ok: false, motivo: esito === 'denied' ? 'negato' : 'ignorato' };
  } catch (e) {
    // Se la richiesta non parte nemmeno, la colpa non è di chi sta davanti allo
    // schermo: si lascia passare.
    return { ok: false, esente: true, motivo: 'errore' };
  }
}

// Come si riaccendono dopo un rifiuto. Dopo un "no" il browser non ripropone
// più la finestra, mai: l'unica strada sono le impostazioni, e senza istruzioni
// precise non le trova nessuno. Questa funzione è ciò che rende un blocco
// accettabile — una porta chiusa con la chiave appesa accanto.
export function comeRiattivare() {
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) ||
              (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (iOS) {
    return {
      dove: 'iPhone',
      passi: [
        'Apri le Impostazioni del telefono',
        'Scorri l\'elenco delle app e tocca Beeppy',
        'Tocca Notifiche e attiva "Consenti notifiche"',
      ],
    };
  }
  if (/Android/.test(ua)) {
    return {
      dove: 'Android',
      passi: [
        'Tocca il lucchetto accanto all\'indirizzo, in alto',
        'Apri "Autorizzazioni"',
        'Metti Notifiche su "Consenti"',
      ],
    };
  }
  return {
    dove: 'questo browser',
    passi: [
      'Clicca il lucchetto accanto all\'indirizzo',
      'Cerca la voce "Notifiche"',
      'Scegli "Consenti", poi ricarica la pagina',
    ],
  };
}

export async function disattiva() {
  if (!supportate()) return { ok: true };
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await net.rimuoviIscrizionePush(sub.endpoint);
      await sub.unsubscribe();
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'Non è stato possibile disattivare.' };
  }
}

// Notifica di prova, mostrata dal dispositivo stesso senza passare da nessun
// server. Serve a verificare la parte che sta sul telefono — permesso, service
// worker, aspetto della notifica — anche prima che esista la chiave per
// spedirle davvero. È anche il modo più onesto di far vedere a qualcuno come
// appariranno, prima di chiedergli il permesso per sempre.
export async function prova() {
  if (!supportate()) return { ok: false, error: 'Le notifiche non sono disponibili qui.' };
  if (Notification.permission !== 'granted') {
    const esito = await Notification.requestPermission();
    if (esito !== 'granted') return { ok: false, error: 'Permesso non concesso.' };
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification('Beeppy', {
      body: 'Ecco come appariranno le notifiche. Questa è solo una prova.',
      icon: 'assets/icon-192.png',
      badge: 'assets/icon-192.png',
      tag: 'prova',
      data: { url: './' },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'Non è stato possibile mostrarla.' };
  }
}

// Su iPhone ha senso proporle solo a chi ha installato il gioco: agli altri
// non arriverebbero comunque, e chiederglielo sarebbe una promessa non
// mantenuta.
export function haSensoProporle(standalone) {
  if (!supportate() || giaChiesto()) return false;
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  return iOS ? standalone : true;
}
