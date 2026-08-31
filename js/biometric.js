// Accesso con Face ID / impronta digitale.
//
// COME FUNZIONA DAVVERO, senza vendere fumo: WebAuthn qui viene usato come
// "lucchetto locale". Alla prima attivazione il dispositivo crea una chiave
// biometrica e noi salviamo il PIN in questo browser; per rileggerlo serve
// un'autenticazione biometrica riuscita. Il PIN però resta scritto sul
// dispositivo: chi avesse in mano il telefono già sbloccato e sapesse dove
// guardare potrebbe leggerlo. Per una classifica di un gioco è un compromesso
// ragionevole; per dei soldi no.
//
// La vera autenticazione forte (passkey verificata dal server) richiederebbe
// una Edge Function che convalida l'assertion e crea la sessione: Supabase non
// supporta WebAuthn nativamente.
//
// Richiede HTTPS (o localhost): da http:// l'API non esiste nemmeno.

const LS_KEY = 'beeppy.biometric';

function b64urlEncode(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || 'null');
  } catch (e) {
    return null;
  }
}

export function isEnrolled() {
  const s = readStore();
  return Boolean(s && s.credentialId && s.nick && s.pin);
}

export function enrolledNick() {
  const s = readStore();
  return s ? s.nick : null;
}

export function forget() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch (e) { /* niente */ }
}

// Nome giusto per la piattaforma: dire "Face ID" a chi ha un'impronta è
// confondente, e viceversa.
export function biometricLabel() {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1))
    return 'Face ID';
  if (/Android/.test(ua)) return 'impronta';
  return 'sblocco biometrico';
}

export async function available() {
  try {
    if (!window.PublicKeyCredential || !navigator.credentials) return false;
    if (!window.isSecureContext) return false; // serve HTTPS
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (e) {
    return false;
  }
}

// Attiva lo sblocco biometrico per queste credenziali.
export async function enroll(nick, pin) {
  if (!(await available())) return { ok: false, error: 'Questo dispositivo non lo supporta.' };
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'Beeppy', id: location.hostname },
        user: { id: userId, name: nick, displayName: nick },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      },
    });
    if (!cred) return { ok: false, error: 'Attivazione annullata.' };
    localStorage.setItem(LS_KEY, JSON.stringify({
      credentialId: b64urlEncode(cred.rawId),
      nick,
      pin,
    }));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: leggibile(e) };
  }
}

// Chiede la biometria e, se va a buon fine, restituisce le credenziali salvate.
export async function unlock() {
  const store = readStore();
  if (!store) return { ok: false, error: 'Sblocco biometrico non attivo.' };
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: location.hostname,
        allowCredentials: [{ type: 'public-key', id: b64urlDecode(store.credentialId) }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    if (!assertion) return { ok: false, error: 'Sblocco annullato.' };
    return { ok: true, nick: store.nick, pin: store.pin };
  } catch (e) {
    return { ok: false, error: leggibile(e) };
  }
}

function leggibile(e) {
  const n = (e && e.name) || '';
  if (n === 'NotAllowedError') return 'Sblocco annullato o scaduto.';
  if (n === 'InvalidStateError') return 'Su questo dispositivo è già attivo.';
  if (n === 'SecurityError') return 'Serve una connessione sicura (https).';
  if (n === 'NotSupportedError') return 'Questo dispositivo non lo supporta.';
  return (e && e.message) || 'Non è stato possibile completare lo sblocco.';
}
