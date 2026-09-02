# 🐝 Beeppy

Gioco webapp per mobile: un'ape vola fra i tronchi, un tap la fa battere le ali.
Account con nickname e **classifica mondiale condivisa**.

- **Zero build**: HTML + CSS + JavaScript a moduli ES nativi. Nessun bundler, nessun
  `node_modules` da installare per andare in produzione.
- **Grafica interamente disegnata in codice** su Canvas 2D (nessuno sprite da caricare:
  resta nitida a qualsiasi densità di schermo e il gioco pesa pochi KB).
- **Backend**: Supabase (autenticazione + Postgres + Row Level Security).
- **PWA**: installabile sulla home del telefono, giocabile anche offline.

Le cose da fare sono in [TODO.md](TODO.md), insieme agli appunti sulle trappole
già incontrate (cache della CDN, service worker) che conviene rileggere prima di
dare la colpa al codice.

## Provare in locale

```bash
npm run dev
```

Poi apri http://localhost:5173 (su telefono: stesso Wi-Fi, `http://IP-DEL-MAC:5173`).

**Per giocare serve un account**, quindi il gioco resta bloccato (con una schermata
che spiega cosa manca) finché non hai configurato Supabase: vedi il paragrafo qui sotto.

Nota sullo sviluppo: su indirizzi locali (`localhost`, `*.local`, IP di rete privata) il
service worker **non viene registrato**, e se ne trova uno installato da visite
precedenti lo rimuove insieme alle sue cache. Serve a evitare il caso, già capitato
davvero, di un dispositivo che continua a eseguire i moduli vecchi mentre l'HTML è già
nuovo: in sviluppo i file devono arrivare sempre dal server, senza intermediari.

## Attivare la classifica online (Supabase)

1. Crea un progetto gratuito su [supabase.com](https://supabase.com).
2. **SQL Editor** → incolla ed esegui tutto il contenuto di [`supabase/schema.sql`](supabase/schema.sql).
3. **Authentication → Sign In / Providers → Email**: disattiva **"Confirm email"**.
   Serve perché il login è a nickname: il gioco genera internamente una email
   sintetica (`nickname@beeppy.play`) che non esiste e non va confermata.
   Non serve invece abbassare la lunghezza minima della password: il PIN viene
   derivato in una stringa più lunga (vedi *Accesso con nickname e PIN*).
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

## Accesso con nickname e PIN

Non c'è email e non c'è password: si entra con un **nickname** e un **PIN di 4-8
cifre**, con il tastierino numerico (`inputmode="numeric"`).

Due dettagli implementativi che è importante conoscere prima di toccare questa parte:

- **Il PIN non viene spedito così com'è.** Supabase Auth rifiuta password sotto i 6
  caratteri, quindi `pinToPassword()` in [`js/net.js`](js/net.js) deriva la password
  vera dal PIN (`beeppy.pin.v1:1234`). **Quella formula non va mai cambiata:**
  cambiarla equivale a cambiare la password di tutti gli account esistenti, che senza
  email non avrebbero modo di rientrare.
- **Il campo resta `type="password"`** anche se accetta solo cifre, perché è il tipo
  che i gestori di credenziali riconoscono: è quello che permette a iOS di salvare il
  PIN nel portachiavi e di reinserirlo con Face ID. Un tastierino disegnato da noi
  sarebbe più bello e sempre numerico, ma spegnerebbe l'autofill e quindi Face ID.

### Quanto è sicuro un PIN di 4 cifre

Poco, e va detto: sono 10.000 combinazioni e i nickname sono pubblici in classifica,
quindi in teoria un account si può forzare provando tutti i PIN. L'unica difesa reale
sono i **limiti per indirizzo IP di Supabase Auth** (Authentication → Rate limits), che
rendono l'operazione lunga giorni per un singolo account. Per una classifica di un
gioco è un compromesso accettabile; se un giorno ci fosse in gioco qualcosa di più,
la strada è alzare il minimo a 6 cifre (`PIN_MIN` in `js/net.js`) e stringere quei
limiti.

Il campo accetta fino a 8 cifre: chi vuole può già usarne di più.

### Face ID / impronta digitale

Due meccanismi diversi, che conviene non confondere:

1. **Portachiavi del sistema** (funziona da subito, senza codice nostro): iOS e Android
   propongono di salvare il PIN e lo reinseriscono dopo un'autenticazione biometrica.
   Dipende solo dagli attributi `autocomplete` corretti sul form, che ci sono.
2. **Sblocco biometrico dentro il gioco** ([`js/biometric.js`](js/biometric.js)): alla
   prima attivazione il dispositivo crea una chiave WebAuthn e il PIN viene salvato in
   quel browser; per rileggerlo serve Face ID o l'impronta. Al successivo avvio compare
   *"Entra come nickname con Face ID"*.

   Sul secondo va detta una cosa scomoda: **il PIN resta scritto sul dispositivo.**
   WebAuthn qui è un lucchetto sull'accesso, non una cassaforte: chi avesse in mano il
   telefono già sbloccato e sapesse dove guardare potrebbe leggerlo. La vera
   autenticazione forte (passkey verificata dal server) richiederebbe una Edge Function
   che convalida l'assertion e crea la sessione, perché Supabase non supporta WebAuthn
   nativamente.

   Richiede **HTTPS**: da `http://` l'API non esiste e il gioco lo dice invece di
   fallire in silenzio.

## Registrazione obbligatoria e controlli anti-spam

Per giocare serve un account, **senza eccezioni**: così ogni punteggio ha un
proprietario e la classifica non si riempie di partite anonime. Se la classifica online
non è configurata non si gioca, e la schermata di accesso dice cosa manca invece di
lasciare che l'invio del punteggio fallisca a partita conclusa.

Non esiste nessuna scorciatoia per giocare senza account: c'era una modalità prova
attivabile dall'URL, ed è stata rimossa perché confondeva più di quanto aiutasse. Per
provare il gioco durante lo sviluppo si guida la partita dalla console:

```js
window.beeppy.game.arm()   // pronti
window.beeppy.game.tap()   // batti le ali
```

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
| `js/biometric.js` | sblocco con Face ID / impronta (WebAuthn come lucchetto locale) |
| `js/install.js` | invito a installare l'app, diverso fra iOS e Android |
| `scripts/sim-bot.js` | bot che gioca da solo: serve a tarare la difficoltà senza browser |
| `scripts/check-fairness.js` | verifica che ogni coppia di tronchi sia raggiungibile in volo |

## Taratura della difficoltà

```bash
npm test                     # determinismo + equità (i due controlli automatici)
node scripts/sim-bot.js      # un bot gioca da solo: quanti punti fa?
```

La difficoltà cresce così, e poi **si ferma** (vedi `js/constants.js`):

**La velocità sale in due tempi.** Prima una rampa leggibile, poi una salita quasi
impercettibile che arriva al tetto solo oltre i 150 tronchi:

| punti | 0 | 20 | 30 | 50 | 100 | 150+ |
| --- | --- | --- | --- | --- | --- | --- |
| velocità | 235 | 299 | **330** | 337 | 353 | **370** |
| tempo fra due tronchi | 1,28 s | 1,00 s | 0,91 s | 0,89 s | 0,85 s | 0,81 s |

**Il varco segue lo stesso schema**, per lo stesso motivo:

| tronchi | 0 | 20 | 30 | **44** | 60 | 100 | **150+** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| varco | 250 | 216 | 199 | **175** | 173 | 167 | **160** |
| spazio utile | 149 | 115 | 98 | 74 | 72 | 66 | 59 |

("spazio utile" è il varco meno la hitbox dell'ape e meno il rimbalzo di un battito
d'ali: è il margine di manovra che resta davvero.)

Perché entrambe le curve sono spezzate così: la partita normale resta sempre nella
fascia leggibile, mentre chi arriva molto lontano trova comunque qualcosa che si
stringe, invece di un livello identico all'infinito. E i tetti sono voluti: con la
difficoltà che sale senza fine tutti muoiono più o meno allo stesso punteggio e la
classifica misurerebbe solo i millisecondi di reazione.

Un bot competente chiude fra i 109 e i 491 punti, con partite da 1,7 a 7 minuti.

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

`npm run test:fairness` controlla due invarianti su 2800 tronchi e **fallisce** (exit
code 1, verificato) se uno dei due cade:

1. nessuna coppia di tronchi richiede più dell'80% della salita possibile;
2. il varco più stretto lascia almeno 40 unità di manovra dopo aver sottratto la
   hitbox dell'ape e il rimbalzo di un battito d'ali — un `GAP_MIN` troppo basso
   renderebbe il finale ingiocabile a prescindere dall'abilità.

Se ritocchi `GRAVITY`, `FLAP_V`, `SPEED_MAX`, `SPACING` o `GAP_MIN`, eseguilo: è lì
per questo.

### L'altro vincolo da ricordare

La soglia anti-cheat in `submit_score()` pretende almeno 0,7 s di gioco per punto,
mentre alla velocità massima un punto richiede 300/370 = 0,81 s: il margine è del 16%
nel caso peggiore (e del 30% nella fascia dei 330, dove si gioca quasi sempre).
Se alzi `SPEED_MAX` o abbassi `SPACING`, ricontrolla quel rapporto e abbassa la soglia
di conseguenza, altrimenti i punteggi legittimi dei giocatori più bravi verrebbero
rifiutati.

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
  quando la rete manca. Non serve toccare nulla a ogni pubblicazione. Se cambi la
  lista dei file in [`sw.js`](sw.js), alza il nome della cache (`beeppy-v2` → `v3`)
  per buttare via quella vecchia all'attivazione.

  Attenzione a un tranello che è già costato una sessione di debug: **il service
  worker che gira è quello installato in una visita precedente**, con le sue
  regole, anche dopo che hai pubblicato la versione nuova. Si può quindi finire con
  l'HTML nuovo e i moduli vecchi, cioè un'app mezza aggiornata che si comporta in
  un modo che non esiste in nessuna versione (nel caso reale: la schermata diceva
  "modalità prova" mentre sotto girava la logica precedente, che lasciava giocare
  senza account). Per questo `js/main.js` ora chiede un controllo aggiornamenti
  esplicito a ogni apertura e **ricarica una volta** quando un service worker
  nuovo prende il controllo.

  Se un dispositivo resta comunque indietro, la via sicura è cancellare i dati del
  sito: su iOS *Impostazioni → Safari → Avanzate → Dati dei siti web*.
