# Beeppy — cose da fare

Stato alla versione attuale (commit `674c0e1`, sito su https://beeppy.beezy.it).
Ordinate per urgenza: la P0 blocca l'invito agli amici, il resto no.

---

## P0 — prima di far entrare gente

- [ ] **Cancellare l'account di collaudo `verifica_prod`** dalla dashboard Supabase
      (Authentication → Users). Ha 60 punti ed è **primo in classifica**: chi arriva
      vede in testa un nickname che non conosce. La cancellazione porta via anche
      profilo e punteggio, che sono in cascata.
- [ ] **Finire la verifica in produzione.** Confermati sul sito pubblicato: avvio,
      vincolo dell'account, registrazione con PIN, partita reale da 60 punti in 60
      secondi con invio del punteggio e posizione #1, difese del form (PIN corto,
      campo trappola, nickname di spam respinto dal database). **Non ancora
      verificati**: la modale della classifica, la registrazione del service worker
      su HTTPS, l'installazione come app.
- [ ] **Provare sull'iPhone vero** tre cose che in un browser da scrivania non si
      possono verificare: il tocco tenuto premuto (non deve più selezionare la
      pagina), l'aggiunta alla schermata Home con la sua schermata di avvio, e lo
      sblocco con Face ID, che richiede HTTPS e quindi funziona solo ora che il
      sito è pubblicato.

## P1 — prodotto

### Scheda profilo più ricca

Oggi la schermata dell'account mostra nickname, record e poco altro. Da fare una
scheda vera. **Con i dati che il database ha già** (nessuna modifica allo schema):

- [ ] Avatar generato dal nickname — un'ape con colori ricavati da un hash del
      nome, così ognuno ha la sua senza caricare nessuna immagine (coerente con la
      scelta di avere zero asset esterni)
- [ ] Record personale in evidenza e **posizione in classifica** (già calcolata
      dalla vista `leaderboard`)
- [ ] **Partite giocate** (`games_played`)
- [ ] **Battiti d'ali totali** (`total_flaps`) — statistica inutile e simpatica,
      di quelle che si raccontano
- [ ] **Membro dal** (`profiles.created_at`)
- [ ] **Distanza percorsa**, calcolabile senza nuovi dati: punti × 300 unità
      di mondo, convertite in metri con un fattore inventato ma coerente
- [ ] Traguardi sbloccati (10, 25, 50, 100 punti; 50 e 500 partite), tutti
      derivabili dai contatori esistenti

**Cosa richiede invece modifiche al database**, da decidere se vale:

- [ ] **Storico delle ultime partite** e un grafico dell'andamento → serve una
      tabella `games` con una riga per partita (punteggio, durata, data), scritta
      da `submit_score()`, con policy RLS che lascia leggere a ciascuno solo le
      proprie. È la modifica che dà più valore alla scheda.
- [ ] **Punteggio medio** → serve una colonna `total_score` in `scores`
      (o si ricava dalla tabella `games`, se la si fa)
- [ ] **Data del record** → colonna `best_at`, per poter scrivere "record del
      3 settembre"

### Altro

- [ ] **Musica di sottofondo**, sintetizzata con WebAudio come gli effetti (zero
      byte scaricati): basso, arpeggio nella stessa scala pentatonica dei suoni di
      punto, e tempo che accelera con la difficoltà. Serve un secondo interruttore
      separato da quello degli effetti, perché la musica stanca prima.
- [ ] Ritoccare la fine partita: mostrare anche il **migliore in assoluto** e
      quanto manca per superare chi ti precede in classifica.
- [ ] Classifica **settimanale** oltre a quella di sempre: dà una speranza a chi
      arriva dopo, quando i record in cima saranno alti.

## P2 — se e quando si va sugli store

Vedi le note nella conversazione per costi e rischi. In breve: Apple 99 $/anno,
Google 25 $ una tantum, e la review di Apple è il vero ostacolo (linee guida 4.2
"app che è solo un sito" e 4.3 "cloni").

- [ ] Aggiornare **Node** (ora la 16, serve almeno la 20) e installare Android Studio
- [ ] Montare **Capacitor** con i due progetti nativi (`it.beezy.beeppy`)
- [ ] **Cancellazione dell'account dall'app** — obbligo Apple (5.1.1v) per ogni app
      che permette di registrarsi. Richiede una Edge Function su Supabase, perché
      cancellare un utente vuole la chiave amministrativa. **Da fare comunque,
      store o no: è corretto verso chi si registra.**
- [ ] **Informativa privacy** su URL pubblico + questionari App Privacy (Apple) e
      Data Safety (Google)
- [ ] **Consenso GDPR** con una CMP certificata (Google UMP) e prompt **ATT** su iOS
- [ ] Icone, screenshot per i formati richiesti, feature graphic 1024×500 per Google
- [ ] Vibrazione al tocco e rispetto dell'interruttore del silenzioso: dettagli che
      distinguono un'app da un sito impacchettato, e che la review guarda
- [ ] **AdMob**, per ultimo e solo con del pubblico vero: video premiato per
      continuare la partita (il formato che rende di più e che i giocatori
      scelgono), interstiziale ogni 3-4 morti, banner solo nel menu. Mai durante
      il volo.

## P3 — quando servirà davvero

- [ ] **Validazione per replay** dei punteggi: la simulazione è già deterministica e
      ogni partita registra `seed` e il tick di ogni tap, quindi il server può
      rigiocarla e verificare. È la difesa definitiva contro i punteggi falsi, oggi
      non necessaria.
- [ ] **Captcha** alla registrazione (Supabase supporta hCaptcha e Turnstile
      nativamente), se lo spam diventasse un problema reale
- [ ] Suggerire il nickname libero quando quello scelto è già preso

---

## Trappole già pagate, da non ripagare

Appunti da rileggere prima di dare la colpa al codice.

- **La CDN di Hostinger serve copie vecchie.** Dopo una pubblicazione può capitare
  di avere l'HTML nuovo e il JavaScript vecchio: l'app si rompe in modi che non
  esistono in nessuna versione. Il purge dalla dashboard può essere **parziale**
  (è successo: `styles.css`, `main.js`, `net.js` e `sw.js` erano rimasti indietro).
  Come si riconosce: negli header, `last-modified` vecchio con
  `cache-control: public, max-age=604800` e `x-hcdn-cache-status: HIT`.
  Soluzione definitiva sarebbe **versionare gli URL** dei file a ogni
  pubblicazione, così la CDN non può servire niente di vecchio.
- **La protezione anti-bot di Hostinger** risponde con una pagina HTML
  ("Checking your browser before accessing") al posto dei file, se arrivano molte
  richieste automatiche ravvicinate. Se un controllo da riga di comando dà
  risultati assurdi, è probabilmente lei: rallentare e riprovare.
- **Il service worker può servire una versione vecchia anche a purge fatto.** Per
  questo in sviluppo non viene più registrato e viene rimosso se trovato, e in
  produzione la pagina si ricarica una volta quando ne prende il controllo uno nuovo.
- **La schermata di riparazione non deve dipendere da CSS o JavaScript esterni**:
  serve proprio quando quelli sono rotti. Gli stili stanno scritti dentro
  `index.html` per questo motivo, non per pigrizia.

## Piccolezze

- [ ] Il messaggio d'errore della schermata di accesso non viene azzerato dopo una
      registrazione riuscita: resta scritto nel DOM, invisibile perché la modale si
      chiude, e viene nascosto alla riapertura. Nessuno lo vede, ma è disordine.
