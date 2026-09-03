# Notifiche: quali sono, quando arrivano

Riferimento unico. Le regole vivono in
[`scripts/notifiche/decidi.js`](scripts/notifiche/decidi.js) e si possono provare
senza spedire niente a nessuno con `npm run test:notifiche`.

## Le regole che valgono per tutte

Vengono prima di ogni singola notifica, e servono a non farsi disinstallare:

| regola | valore |
| --- | --- |
| Massimo per persona | **una ogni 2 giorni** — con due eccezioni, sotto |
| Quante per volta | **una sola**, la più utile fra quelle applicabili |
| Silenzio notturno | **dalle 23 alle 8** non parte niente |
| Chi sta giocando | chi ha giocato **nelle ultime 6 ore** non viene disturbato |
| Chi non ha dato il permesso | non riceve nulla, ovviamente |

## Le notifiche automatiche

Il controllo gira **ogni due ore**. Non per mandare più notifiche — i limiti
restano quelli sopra — ma perché un annuncio messo in coda dal pannello parta
entro un tempo ragionevole. In ordine di precedenza: se una persona ricade in
più casi, riceve solo il primo.

| # | Quando arriva | Cosa dice |
| --- | --- | --- |
| 0 | **Manca l'email** — **ogni giorno** finché non la inserisce | *"Senza email non puoi giocare. Aggiungila dal profilo: ci vuole un attimo."* |
| 1 | **Qualcuno ti ha superato** — **sempre**, al massimo una ogni 6 ore | *"Pueblo ti ha passato: sei 3° in classifica."* |
| 2 | **Non giochi da 3 giorni o più** | *"Sono 3 giorni che non giochi. Ti va una partita?"* — oltre i 14 giorni cambia in *"Sono 20 giorni che non voli. Il tuo record di 50 è ancora lì."* |
| 3 | **Niente foto profilo**, e hai giocato almeno 5 partite | *"Aggiungi una foto al profilo: comparirà accanto al tuo nome in classifica."* (una volta sola) |
| 4 | **Lunedì**, se sei in classifica | *"Sei 4° con 50. Regge un'altra settimana?"* |

**Le due eccezioni al limite dei due giorni** sono le prime due, e per ragioni
opposte.

L'**email** perché senza di essa il gioco è bloccato: non è un invito a tornare,
è l'unica strada per poter giocare. Arriva ogni giorno finché non viene
inserita, e a chi è in quella condizione non si manda nient'altro — invitarlo a
giocare sapendo che troverebbe un muro sarebbe una presa in giro.

Il **sorpasso** perché è l'unica notifica che ha un motivo *adesso*: farla
tacere perché due giorni fa era arrivato un promemoria significherebbe perdere
l'unica occasione in cui c'era davvero qualcosa da rifare. Ha però un limite
suo, di sei ore: in una serata movimentata, essere avvisati a ogni scavalcamento
sarebbe il motivo perfetto per disattivarle tutte.

Le altre scendono verso il promemoria di servizio e rispettano il limite dei due
giorni.

Le notifiche "una volta sola" (email e foto) si ricordano davvero: la colonna
`tipi_inviati` tiene l'elenco di quelle già spedite a ciascuno. Guardare solo
l'ultima mandata non basterebbe, perché viene sovrascritta e quelle da mandare
una volta tornerebbero a partire.

## Gli annunci scritti a mano

Due strade:

- **Dal pannello di amministrazione** (`/admin.html`, sezione Notifiche): si
  scrive titolo e testo e si mette in coda. Parte al giro successivo, quindi
  entro due ore.
- **Subito, da GitHub** → **Actions** → *Notifiche ai giocatori* → **Run
  workflow**: si inserisce titolo e testo, si spunta *manda*, e partono
  immediatamente.

Gli annunci **saltano il limite dei due giorni** (sono eventi eccezionali) ma
**non lo consumano**: chi riceve un annuncio oggi può ricevere domani la sua
notifica automatica. Non sarebbe giusto che un avviso di servizio rubasse il
posto a un "ti hanno superato".

Senza spuntare *manda*, il lavoro dice soltanto cosa avrebbe spedito: comodo per
controllare prima.

## Dove funzionano

- **iPhone e iPad**: solo se il gioco è stato **aggiunto alla schermata Home**
  (da iOS 16.4). Dal browser non arriveranno mai, e non è una nostra mancanza.
- **Android**: sia dal browser sia da installato.
- **Serve HTTPS**, che c'è.

Chi non può riceverle non vede nemmeno la proposta: prometterle e non
mantenerle è peggio che non offrirle.

## Quando viene chiesto il permesso

**A fine partita.** Alla seconda per chi arriva adesso; **subito, alla prima**,
per chi ha già un record — quello il gioco lo conosce, e fargli aspettare
un'altra partita è solo tempo perso. A lui il testo cambia in *"Novità: ti
avviso quando qualcuno ti supera in classifica"*, perché sappia perché glielo
chiediamo proprio ora.

Mai all'apertura: chiedere il permesso
appena si entra è il modo più sicuro per farselo negare, e dopo un rifiuto il
browser non lo richiede più — non c'è modo di tornare indietro se non dalle
impostazioni del telefono.

Chi dice no non se lo vede più riproporre. Chiunque può cambiare idea in
qualsiasi momento dal proprio profilo, dove c'è anche **"Mandami una notifica di
prova"**: la mostra il telefono stesso, senza passare da nessun server, e serve a
vedere come appaiono prima di decidere.

## Il permesso non è forzabile

Vale la pena scriverlo, perché è la prima cosa che viene in mente di chiedere:
**non esiste modo di attivare le notifiche al posto di qualcuno.** Il browser
concede il permesso solo tramite una finestra che controlla lui, dopo un gesto
della persona; non c'è nessuna funzione per darlo dal codice. E senza quel
passaggio non esiste nemmeno un indirizzo a cui spedire, perché l'iscrizione la
genera il dispositivo. Vale per Beeppy come per qualsiasi altra app.

L'unica leva è chiedere nel momento giusto, con una ragione comprensibile.

## Cosa manca per accenderle davvero

1. `npm run chiavi-push` — genera la coppia di chiavi. Va fatto **una volta sola**.
2. La chiave **pubblica** in `js/config.js`, campo `VAPID_PUBLIC_KEY`.
3. La chiave **privata** nei segreti del repository (Settings → Secrets and
   variables → Actions), nome `VAPID_PRIVATE_KEY` — oppure `BEEPPY`, che il
   lavoro accetta lo stesso. **Non deve finire in nessun altro posto**: chi ce
   l'ha può mandare notifiche a nome di Beeppy.
4. Stessa pagina, altri due segreti: `VAPID_PUBLIC_KEY` (la stessa del punto 2) e
   `SUPABASE_SERVICE_ROLE` (Project Settings → API → service_role).
5. Eseguire `supabase/schema.sql`, che crea le tabelle delle iscrizioni.

Finché mancano, il lavoro programmato gira a vuoto e scrive nel registro cosa
avrebbe mandato: si può guardare senza rischiare di svegliare nessuno.
