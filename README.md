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

## Installazione come app

Beeppy è una PWA: si aggiunge alla schermata Home e si apre a schermo pieno, senza
barre del browser, con la sua icona e la sua schermata di avvio.

- **iPhone / iPad:** apri il sito in **Safari** (non nel browser di Instagram o
  Facebook, che non hanno la voce giusta), tocca **Condividi** e poi **Aggiungi alla
  schermata Home**. Il gioco lo suggerisce da sé dopo la prima partita.
- **Android:** Chrome mostra il pulsante **Installa** dentro il gioco.

Serve **HTTPS**: da `http://` l'installazione e il funzionamento offline non partono.

Le schermate di avvio iOS stanno in `assets/splash/` e si rigenerano con:

```bash
bash scripts/make-splash.sh
```

iOS usa l'immagine di avvio **solo se le misure combaciano esattamente** con quelle
del dispositivo: se esce un iPhone con un formato nuovo, va aggiunto alla lista
`SIZES` dello script e ai `<link rel="apple-touch-startup-image">` in `index.html`.

## Registrazione obbligatoria e controlli anti-spam

Per giocare serve un account: così ogni punteggio ha un proprietario e la classifica
non si riempie di partite anonime. (Se Supabase non è configurato il gioco resta
giocabile in locale, altrimenti sarebbe inutilizzabile.)

Le difese sono su tre livelli, dal più aggirabile al più solido:

1. **Sul form** (`js/net.js`): un campo trappola invisibile che i bot compilano e gli
   umani no; un tempo minimo di compilazione di 2,5 secondi; un limite di 3 account
   al giorno per dispositivo. Fermano l'automazione grezza, ma si aggirano svuotando
   la memoria del browser: sono un filtro, non un muro.
2. **Sul database** (`supabase/schema.sql`): la funzione `nickname_ok()` è la regola
   unica — la usano il vincolo della tabella, il trigger di registrazione e il
   controllo di disponibilità. Rifiuta indirizzi web, nomi commerciali tipici dello
   spam, caratteri ripetuti e nickname che fingerebbero un ruolo ufficiale
   (`admin`, `staff`, `beeppy`...). La lista è in un unico punto ed è facile
   allungarla.
3. **Su Supabase Auth**: i limiti per indirizzo IP sono già attivi e si possono
   stringere dalla dashboard (Authentication → Rate limits). È l'unico livello che
   un utente non può toccare dal proprio browser.

Se lo spam diventasse un problema reale, il passo successivo è un captcha:
Supabase supporta hCaptcha e Turnstile nativamente (Authentication → Settings →
Bot and abuse protection), e sul form andrebbe aggiunto il widget.

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
| `scripts/check-fairness.js` | verifica che ogni coppia di tronchi sia raggiungibile in volo |

## Taratura della difficoltà

```bash
npm test                     # determinismo + equità (i due controlli automatici)
node scripts/sim-bot.js      # un bot gioca da solo: quanti punti fa?
```

La difficoltà cresce così, e poi **si ferma** (vedi `js/constants.js`):

| | inizio | fine | plateau |
| --- | --- | --- | --- |
| velocità | 235 | 400 (+5,5 per punto) | punto 30 |
| varco | 250 | 168 (−2,2 per tronco) | tronco 37 |
| tempo fra due tronchi | 1,28 s | 0,75 s | |

Il tetto è voluto: con l'accelerazione infinita tutti muoiono più o meno allo stesso
punteggio e la classifica misura solo i millisecondi di reazione. Con il plateau il
punteggio cresce quanto regge la concentrazione. Un bot competente chiude fra i 32 e i
210 punti.

### La regola di equità

**Il varco successivo deve essere raggiungibile a volo.** Prima non lo era: la posizione
era casuale dentro tutta l'altezza utile, quindi capitava un varco in basso seguito da
uno in alto con 396 unità di dislivello, mentre nel tempo disponibile l'ape ne risale
201. Quelle coppie non erano difficili, erano impossibili, e più la velocità saliva più
capitavano spesso: il gioco sembrava murarsi verso i 28 punti.

Ora `maxGapShift()` limita lo spostamento del varco a una frazione di quanto l'ape sale
davvero, ricavata dalla fisica (impulso e gravità), quindi il limite si adatta da sé se
ritocchi il volo. Salire costa più che scendere, per cui il limite verso il basso è più
generoso (`FALL_BONUS`): la varietà dei tracciati resta.

`npm run test:fairness` controlla 2800 tronchi e **fallisce** se una coppia richiede più
dell'80% della salita possibile. Se ritocchi `GRAVITY`, `FLAP_V`, `SPEED_MAX` o
`SPACING`, eseguilo: è lì per questo.

### L'altro vincolo da ricordare

La soglia anti-cheat in `submit_score()` pretende almeno 0,7 s di gioco per punto,
mentre alla velocità massima un punto richiede 300/400 = 0,75 s: restano solo 7 punti
percentuali di margine. Se alzi `SPEED_MAX` o abbassi `SPACING`, abbassa anche quella
soglia, altrimenti i punteggi legittimi dei giocatori più bravi verrebbero rifiutati.

## Deploy su Hostinger

Il progetto è un sito statico puro: non c'è nessun comando di build da eseguire,
la cartella va pubblicata così com'è.

1. hPanel → **Avanzate → GIT**.
2. Repository: `https://github.com/lucatorre1996-netizen/beeppy.git`, branch `main`,
   directory di installazione: la cartella pubblica del dominio (di norma
   `public_html`, oppure la sottocartella del sottodominio).
3. **Deploy**. Per gli aggiornamenti successivi basta *Deploy* di nuovo, oppure
   configura il webhook che Hostinger fornisce e aggiungilo su GitHub
   (Settings → Webhooks) per pubblicare a ogni push.

Due cose a cui fare attenzione:

- **Serve HTTPS.** Il service worker (e quindi l'installazione come app) funziona
  solo su HTTPS o su `localhost`: attiva il certificato SSL del dominio.
- **Aggiornamenti.** Il service worker usa la strategia *rete per prima*: chi è
  online riceve sempre l'ultima versione dei file, e la cache entra in gioco solo
  quando la rete manca. Non serve quindi toccare nulla a ogni pubblicazione. Se un
  giorno cambi la lista dei file in [`sw.js`](sw.js), alza il nome della cache
  (`beeppy-v1` → `v2`) per buttare via quella vecchia all'attivazione.
