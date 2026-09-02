# Beeppy — cose da fare

Stato alla versione attuale (commit `674c0e1`, sito su https://beeppy.beezy.it).
Ordinate per urgenza: la P0 blocca l'invito agli amici, il resto no.

---

## P0 — prima di far entrare gente

- [x] ~~Cancellare l'account di collaudo `verifica_prod`~~ — fatto.
- [ ] **Eseguire il nuovo `supabase/schema.sql`** nel SQL Editor. Ora serve per
      quattro cose, non più una: `delete_my_account()`, il codice di recupero
      (`set_recovery_code` e `reset_pin_with_code`), la tabella `games` dello
      storico e `submit_score()` che ci scrive dentro. Finché non lo esegui, quelle
      funzioni rispondono "Funzione non ancora installata" — verificato, falliscono
      in modo comprensibile e non bloccano il gioco. Rieseguire l'intero file è
      sicuro: è tutto `create or replace` e `if not exists`.
- [ ] **Provare il recupero PIN per intero** dopo aver eseguito lo SQL: registrare
      un account di prova, salvare il codice, uscire, rimettere il PIN col codice.
      Di questo percorso ho potuto verificare solo interfaccia, generatore di codici
      e messaggi d'errore: il giro completo richiede le funzioni installate.
- [ ] **Cancellare `test_profilo`**, l'account con cui ho provato la scheda. Ha
      zero punti, quindi non compare in classifica e non disturba nessuno. Dopo
      aver eseguito lo SQL puoi cancellarlo **dall'app stessa**, che è anche il
      modo di collaudare la funzione nuova.
- [x] ~~Verifica in produzione~~ — fatta. Confermati sul sito pubblicato: avvio,
      vincolo dell'account, registrazione con PIN, partita reale da 60 punti in 60
      secondi con invio e posizione #1, difese del form, **classifica** (7 giocatori
      veri, medaglie ai primi tre), **service worker attivo su HTTPS**, **import map
      funzionante** (tutti e 13 i moduli caricati con `?v=`).
- [ ] **Provare sull'iPhone vero** tre cose che in un browser da scrivania non si
      possono verificare: il tocco tenuto premuto (non deve più selezionare la
      pagina), l'aggiunta alla schermata Home con la sua schermata di avvio, e lo
      sblocco con Face ID, che richiede HTTPS e quindi funziona solo ora che il
      sito è pubblicato.

- [x] ~~Ping anti-pausa per Supabase~~ — fatto con un workflow GitHub Actions
      (`.github/workflows/keep-alive.yml`) che legge la classifica ogni 6 ore.
      Nessun servizio esterno, nessun costo. **Attenzione**: GitHub sospende i
      workflow programmati sui repository fermi da 60 giorni.

- [x] ~~Logout poco visibile~~ — era un link sottolineato in fondo alla scheda;
      ora è un pulsante vero ("Esci dall'account").
- [x] ~~Informativa privacy~~ — fatta: `privacy.html`, scritta per essere letta,
      linkata dalla schermata di registrazione.
- [x] ~~Recupero del PIN dimenticato~~ — fatto con un codice di recupero mostrato
      una volta alla registrazione. Del codice il server conserva solo l'impronta
      SHA-256; cinque tentativi sbagliati bloccano il nickname per un'ora, e la
      risposta è identica per nickname inesistente e codice errato, così non si può
      scoprire quali nickname esistono.

## P1 — prodotto

### Scheda profilo più ricca

Oggi la schermata dell'account mostra nickname, record e poco altro. Da fare una
scheda vera. **Fatta** la parte che non richiede modifiche allo schema: avatar generato dal
nickname (l'ape del gioco, con la tinta ricavata da un hash del nome), record in
evidenza con la posizione in classifica, partite giocate, battiti d'ali totali,
distanza percorsa, "nell'alveare dal", otto traguardi che si accendono. Più la
cancellazione dell'account, con doppia conferma.

**Cosa richiede invece modifiche al database:**

- [x] ~~Storico delle ultime partite e grafico dell'andamento~~ — fatto: tabella
      `games` scritta solo da `submit_score()` (quindi solo partite superate dai
      controlli), leggibile da ciascuno solo per le proprie righe. Nella scheda
      compaiono un grafico a barre delle ultime dieci e l'elenco delle ultime
      cinque con "3 minuti fa", "ieri". **Va eseguito lo SQL** perché appaia.
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
- [x] ~~Cancellazione dell'account dall'app~~ — fatta, e senza Edge Function: una
      funzione `security definer` nel database può cancellare da `auth.users`, ma
      solo la riga di chi la chiama. Resta da eseguire lo SQL (vedi P0).
- [x] ~~Informativa privacy su URL pubblico~~ — c'è (`privacy.html`). Restano da
      compilare i questionari App Privacy (Apple) e Data Safety (Google)
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
  **Curato**: gli URL dei moduli sono versionati con una import map dichiarata in
  `index.html` (l'unico file che Hostinger rivalida sempre). Alzando il numero di
  versione a ogni pubblicazione che tocca il JavaScript, nessuna cache può servire
  codice vecchio. Vedi la procedura nel README.
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

- [x] ~~Il messaggio d'errore non azzerato dopo una registrazione riuscita~~ — fatto.
