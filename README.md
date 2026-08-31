# 🐝 Beeppy

Gioco webapp per mobile: un'ape vola fra i tronchi, un tap la fa battere le ali.
Account con nickname e **classifica mondiale condivisa**.

- **Zero build**: HTML + CSS + JavaScript a moduli ES nativi. Nessun bundler, nessun
  `node_modules` da installare per andare in produzione.
- **Grafica interamente disegnata in codice** su Canvas 2D (nessuno sprite da caricare:
  resta nitida a qualsiasi densità di schermo e il gioco pesa pochi KB).
- **Backend**: Supabase (autenticazione + Postgres + Row Level Security).
- **PWA**: installabile sulla home del telefono, giocabile anche offline.

## Provare in locale

```bash
npm run dev
```

Poi apri http://localhost:5173 (su telefono: stesso Wi-Fi, `http://IP-DEL-MAC:5173`).

Senza configurare Supabase il gioco funziona subito in **modalità offline**: si gioca
e il record viene salvato sul dispositivo, ma non c'è classifica condivisa.

## Attivare la classifica online (Supabase)

1. Crea un progetto gratuito su [supabase.com](https://supabase.com).
2. **SQL Editor** → incolla ed esegui tutto il contenuto di [`supabase/schema.sql`](supabase/schema.sql).
3. **Authentication → Sign In / Providers → Email**: disattiva **"Confirm email"**.
   Serve perché il login è a nickname: il gioco genera internamente una email
   sintetica (`nickname@beeppy.play`) che non esiste e non va confermata.
4. **Project Settings → API**: copia *Project URL* e *anon public key* in
   [`js/config.js`](js/config.js).

```js
export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

La `anon key` è **pubblica per definizione**: può stare nel repo. La sicurezza non
dipende da lei ma dalle policy RLS dello schema.

## Come sono protetti i punteggi

Il client non può scrivere nella tabella `scores`: non esistono policy di insert o
update. L'unica via è la funzione `submit_score()`, che:

1. richiede un utente autenticato;
2. rifiuta punteggi oltre il tetto massimo;
3. applica un rate limit (un invio ogni 2 secondi);
4. verifica la **plausibilità**: servono almeno ~0,7 s di gioco e mezzo battito d'ali
   per punto (nel gioco reale servono ~1 s e ~2,5 battiti, quindi la soglia è prudente);
5. alza il record, mai lo abbassa.

Questo ferma i casi normali, **non** un utente esperto che ricostruisce la chiamata a
mano dalla console del browser: il punteggio nasce sul client, quindi resta falsificabile.
La difesa definitiva è la validazione per replay, per cui il terreno è già preparato:
la simulazione ([`js/sim.js`](js/sim.js)) è deterministica a passo fisso e ogni partita
registra `seed` e `inputLog` (il tick di ogni tap). Rigiocando quella sequenza lato
server si ottiene lo stesso punteggio, o si scopre che non torna.

## Struttura

| file | ruolo |
| --- | --- |
| `js/sim.js` | simulazione pura e deterministica (fisica, tronchi, collisioni, punteggio) |
| `js/game.js` | macchina a stati, loop a passo fisso, particelle, effetti |
| `js/render.js` | tutto il disegno: parallasse, corteccia, anelli del legno, ape |
| `js/palette.js` | colori del gioco in un unico posto |
| `js/constants.js` | fisica e taratura della difficoltà |
| `js/net.js` | Supabase + fallback locale (il gioco non si rompe mai se la rete manca) |
| `js/ui.js` | schermate, login, classifica |
| `js/audio.js` | effetti sonori sintetizzati con WebAudio (nessun file audio) |
| `scripts/sim-bot.js` | bot che gioca da solo: serve a tarare la difficoltà senza browser |

## Taratura della difficoltà

```bash
npm run test:sim        # verifica che la simulazione sia deterministica
node scripts/sim-bot.js # un bot gioca: quanti punti fa un giocatore competente?
```

Valori attuali: un giocatore discreto arriva fra i 15 e i 60 punti. Il varco si stringe
da 250 a 168 unità e la velocità sale da 235 a 400 al crescere del punteggio
(vedi `js/constants.js`).

## Deploy

Il progetto è un sito statico: basta pubblicare la cartella così com'è.
Su Hostinger, collega il repository Git al dominio; non serve nessun comando di build.
