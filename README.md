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

## Taratura della difficoltà

```bash
npm run test:sim        # verifica che la simulazione sia deterministica
node scripts/sim-bot.js # un bot gioca: quanti punti fa un giocatore competente?
```

Valori attuali: un giocatore discreto chiude fra i 20 e i 50 punti. Il varco si stringe
da 250 a 168 unità nell'arco dei primi 37 tronchi e la velocità sale da 235 a 400 entro
i 30 punti (vedi `js/constants.js`).

Un dettaglio da non perdere di vista se ritocchi questi valori: la soglia anti-cheat in
`submit_score()` pretende almeno 0,7 s di gioco per punto, mentre alla velocità massima
un punto richiede 300/400 = 0,75 s. Se alzi ancora `SPEED_MAX` o abbassi `SPACING`,
abbassa di conseguenza quella soglia, altrimenti i punteggi legittimi dei giocatori più
bravi verrebbero rifiutati.

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
