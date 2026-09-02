// Genera la coppia di chiavi VAPID per le notifiche push.
//
// Si esegue una volta sola:   npm run chiavi-push
//
// La chiave PUBBLICA va in js/config.js: è pubblica per definizione, la spedisce
// il browser a ogni iscrizione.
// La chiave PRIVATA va incollata nei segreti di GitHub e NON deve finire nel
// repository, in una chat o in un file di configurazione. Chi ce l'ha può
// mandare notifiche a nome di Beeppy.
//
// Nessuna dipendenza: usa la crittografia già dentro Node.
import { generateKeyPairSync, createPublicKey } from 'node:crypto';

function base64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

// La chiave pubblica VAPID è il punto della curva in formato non compresso (65 byte).
const pubDer = publicKey.export({ type: 'spki', format: 'der' });
const pubRaw = pubDer.subarray(pubDer.length - 65);

// La privata è lo scalare a 32 byte.
const privJwk = privateKey.export({ format: 'jwk' });
const privRaw = Buffer.from(privJwk.d, 'base64url');

console.log('\n  CHIAVE PUBBLICA  (va in js/config.js, campo VAPID_PUBLIC_KEY)\n');
console.log('   ' + base64url(pubRaw));
console.log('\n  CHIAVE PRIVATA   (va nei segreti di GitHub, nome VAPID_PRIVATE_KEY)\n');
console.log('   ' + base64url(privRaw));
console.log('\n  Non incollare la privata da nessun altra parte: né nel codice,');
console.log('  né in una chat. Chi ce l\'ha può mandare notifiche a nome di Beeppy.\n');

// controllo di sanità: la pubblica deve avere la forma attesa
if (pubRaw.length !== 65 || pubRaw[0] !== 4) {
  console.error('  ATTENZIONE: la chiave pubblica non ha il formato atteso.');
  process.exit(1);
}
if (privRaw.length !== 32) {
  console.error('  ATTENZIONE: la chiave privata non ha la lunghezza attesa.');
  process.exit(1);
}
