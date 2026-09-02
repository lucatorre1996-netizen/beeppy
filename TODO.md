# Beeppy — cose da fare

Stato alla versione attuale (commit `674c0e1`, sito su https://beeppy.beezy.it).
Ordinate per urgenza: la P0 blocca l'invito agli amici, il resto no.

---

## P0 — prima di far entrare gente

- [x] ~~Cancellare l'account di collaudo `verifica_prod`~~ — fatto.
- [ ] **Rieseguire `supabase/schema.sql`.** Una parte è già stata eseguita (le
      tabelle ci sono, la classifica è chiusa agli anonimi, le funzioni admin
      rispondono), ma mancano le aggiunte più recenti: il permesso di *creare* la
      riga dei contatti — senza il quale chi si è iscritto prima non può inserire
      la propria email — il bucket delle foto profilo e la chiave di
      configurazione `richiedi_installazione`.
      **Ordine importante: prima questo, poi il Deploy.** Al contrario, i giocatori
      già iscritti si vedrebbero chiedere l'email senza poterla salvare (il gioco
      li lascia passare lo stesso, ma dopo un messaggio d'errore che non meritano).
      Vecchia nota, ancora valida: `delete_my_account()`, il codice di recupero
      (`set_recovery_code` e `reset_pin_with_code`), la tabella `games` dello
      storico, `submit_score()` che ci scrive dentro, le funzioni dell'area
      amministratore e la tabella `app_config`. Finché non lo esegui, quelle
      funzioni rispondono "Funzione non ancora installata" — verificato, falliscono
      in modo comprensibile e non bloccano il gioco. Rieseguire l'intero file è
      sicuro: è tutto `create or replace` e `if not exists`.
- [ ] **Crearsi l'account amministratore**: dashboard Supabase → Authentication →
      Users → "Add user" con email e una password lunga, poi la riga di SQL che
      trovi commentata in `supabase/schema.sql`. Si entra da `/admin.html`. È
      volutamente separato dall'account di gioco: un PIN di quattro cifre non è
      una credenziale adatta a cancellare utenti.
- [ ] **Configurare l'SMTP** in Supabase (Project Settings → Authentication → SMTP).
      La pagina admin ora contiene i valori esatti da inserire e un pulsante che
      manda un'email di prova per verificare se funziona. La password va messa lì
      e non nell'app: nel frontend sarebbe leggibile da chiunque.
- [x] ~~Foto profilo~~ — fatta. Il bucket si crea da `supabase/schema.sql`, quindi
      non serve nessun passaggio a mano nel pannello. Il ridimensionamento avviene
      nel browser (ritaglio quadrato, 256 px, qualità che scende finché non sta
      sotto i 240 KB): dal telefono non parte una foto da cinque megabyte. La foto
      compare nel profilo e accanto al nome in classifica; chi non ne carica una
      tiene l'ape disegnata. **Moderazione**: un amministratore può cancellare
      l'avatar di chiunque, perché lo vedono tutti.
- [x] ~~Accesso con Google~~ — **scartato su decisione di Luca** (2 settembre 2026).
      Non riproporlo come se fosse una dimenticanza. Costava un progetto Google
      Cloud, la configurazione OAuth, e un passaggio in più nel gioco per chiedere
      il nickname a chi entra senza averne uno.
- [ ] **Captcha su registrazione e accesso** — Supabase lo supporta (hCaptcha o
      Turnstile) da Authentication → Settings. **Attenzione**: attivandolo lì, tutti
      i form devono spedire il token, altrimenti nessuno riesce più a entrare. Non
      accenderlo senza dirmelo: va fatto in un colpo solo su gioco e admin.
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

- [x] ~~Area amministratore~~ — fatta come **pagina separata** (`/admin.html`) con
      credenziali proprie (email e password, non il PIN di gioco) e una sessione
      distinta da quella del giocatore. Permessi controllati dal database:
      elenco giocatori con azzeramento punteggio ed eliminazione, numeri d'insieme
      (iscritti, partite, nuovi oggi), annuncio mostrato nel menu e interruttore
      per chiudere le registrazioni. Nascondere i pulsanti non protegge niente:
      ogni funzione ricontrolla da sé chi la chiama, e l'interruttore delle
      registrazioni è applicato dal trigger, non dall'interfaccia.

- [x] ~~Obbligo di installazione come app~~ — fatto, ma come **interruttore
      nella pagina admin** (spento per default), non come scelta scolpita nel
      codice: è la modifica che può costare più giocatori, e va provata potendo
      tornare indietro in dieci secondi. La schermata mostra procedure diverse per
      iPhone, Android e — caso decisivo — per il **browser interno di WhatsApp o
      Instagram**, da cui non si può installare nulla: lì dà le istruzioni per
      aprire il link nel browser vero e un pulsante che copia l'indirizzo, invece
      di un vicolo cieco. In caso di dubbio (configurazione illeggibile, rete
      assente) si lascia giocare: nessuno deve restare chiuso fuori per un
      problema che non lo riguarda.

- [x] ~~Dati personali (nome, cognome, email, telefono)~~ — fatti, in registrazione
      e nel profilo, con la sola email obbligatoria. Stanno in una tabella
      `contatti` separata da `profiles`: quest'ultima è leggibile da ogni giocatore
      registrato per via della classifica, quindi metterci dentro i recapiti
      avrebbe significato che chiunque si iscrive legge email e telefono di tutti.
- [x] ~~Pagina admin con la grafica del gioco~~ — fatta, con l'ape come marchio.
- [x] ~~Difese anti-bot sull'accesso admin~~ — campo trappola, tempo minimo di
      compilazione e attesa che cresce con i tentativi falliti (0, 0, 0, 5s, 15s,
      45s…). La difesa vera restano i limiti per IP di Supabase Auth.

- [x] ~~Notifiche push~~ — fatte lato telefono e lato invio. Restano da generare
      le chiavi (`npm run chiavi-push`) e da incollare i segreti su GitHub: vedi
      [NOTIFICHE.md](NOTIFICHE.md).
- [x] ~~Si poteva giocare offline?~~ No, e ora sì. Il client Supabase arrivava da
      un CDN a ogni avvio: senza rete l'accesso non esisteva nemmeno per chi
      aveva la sessione salvata. Ora la copia sta in `js/vendor/`, e una
      connessione assente non fa più uscire nessuno.

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

- [ ] La scheda profilo è diventata lunga (991 px di contenuto): ora scorre, ma
      varrebbe la pena dividerla, per esempio con i dati personali dietro un
      "Modifica" invece che sempre aperti.

- [x] ~~Il messaggio d'errore non azzerato dopo una registrazione riuscita~~ — fatto.
