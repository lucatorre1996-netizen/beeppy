// Legge lo stato del gioco, decide chi avvisare e spedisce.
// Gira su GitHub Actions, non sul telefono di nessuno: la chiave privata che
// serve a firmare le notifiche vive nei segreti del repository.
//
// Senza le variabili d'ambiente gira a vuoto e stampa cosa avrebbe mandato:
// utile per controllare le regole senza disturbare nessuno.
//
//   node scripts/notifiche/invia.js              prova a vuoto
//   node scripts/notifiche/invia.js --manda      spedisce davvero
//   ... --titolo "Torneo" --testo "Stasera alle 21"    annuncio a tutti

import { decidi } from './decidi.js';

const URL = process.env.SUPABASE_URL;
const SERVIZIO = process.env.SUPABASE_SERVICE_ROLE;
const PUB = process.env.VAPID_PUBLIC_KEY;
const PRIV = process.env.VAPID_PRIVATE_KEY;
const MITTENTE = process.env.VAPID_SUBJECT || 'mailto:lucatorre1996@gmail.com';

const arg = (nome) => {
  const i = process.argv.indexOf('--' + nome);
  return i >= 0 ? process.argv[i + 1] : null;
};
const MANDA = process.argv.includes('--manda');
const TITOLO = arg('titolo');
const TESTO = arg('testo');

async function rest(percorso) {
  const r = await fetch(`${URL}/rest/v1/${percorso}`, {
    headers: { apikey: SERVIZIO, Authorization: `Bearer ${SERVIZIO}` },
  });
  if (!r.ok) throw new Error(`${percorso}: HTTP ${r.status} ${await r.text()}`);
  return r.json();
}

async function scrivi(percorso, corpo, conflitto) {
  const r = await fetch(`${URL}/rest/v1/${percorso}`, {
    method: 'POST',
    headers: {
      apikey: SERVIZIO, Authorization: `Bearer ${SERVIZIO}`,
      'Content-Type': 'application/json',
      Prefer: conflitto ? `resolution=merge-duplicates,return=minimal` : 'return=minimal',
    },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`${percorso}: HTTP ${r.status} ${await r.text()}`);
}

async function raccogli() {
  const [profili, punteggi, iscrizioni, stato, contatti] = await Promise.all([
    rest('profiles?select=id,nickname,avatar_at'),
    rest('scores?select=user_id,best_score,games_played,last_submit'),
    rest('push_iscrizioni?select=user_id,endpoint,p256dh,auth'),
    rest('push_stato?select=user_id,posizione,ultima_inviata,ultimo_tipo,tipi_inviati'),
    rest('contatti?select=user_id,email'),
  ]);
  const conEmail = new Set(contatti.filter((c) => c.email).map((c) => c.user_id));

  const perPunteggio = punteggi.slice().sort((a, b) => b.best_score - a.best_score);
  const posizione = new Map();
  perPunteggio.forEach((p, i) => { if (p.best_score > 0) posizione.set(p.user_id, i + 1); });

  const nomi = new Map(profili.map((p) => [p.id, p.nickname]));
  const st = new Map(stato.map((s) => [s.user_id, s]));

  return profili.map((p) => {
    const sc = punteggi.find((x) => x.user_id === p.id) || {};
    const pos = posizione.get(p.id) || null;
    const prec = st.get(p.id) ? st.get(p.id).posizione : null;
    // chi sta ora appena sopra di lui: è il responsabile del sorpasso
    const sopra = pos && pos > 1 ? perPunteggio[pos - 2] : null;
    const s = st.get(p.id) || {};
    return {
      user_id: p.id,
      nickname: p.nickname,
      record: sc.best_score || 0,
      partite: sc.games_played || 0,
      haFoto: Boolean(p.avatar_at),
      ultimaPartita: sc.last_submit ? new Date(sc.last_submit).getTime() : null,
      posizione: pos,
      posizionePrecedente: prec,
      superatoDa: sopra ? nomi.get(sopra.user_id) : null,
      ultimaInviata: s.ultima_inviata ? new Date(s.ultima_inviata).getTime() : null,
      ultimoTipo: s.ultimo_tipo || null,
      tipiInviati: s.tipi_inviati || [],
      haEmail: conEmail.has(p.id),
      iscrizioni: iscrizioni.filter((i) => i.user_id === p.id),
    };
  });
}

async function main() {
  if (!URL || !SERVIZIO) {
    console.log('Manca SUPABASE_URL o SUPABASE_SERVICE_ROLE: non posso leggere nulla.');
    process.exit(1);
  }
  const giocatori = await raccogli();
  console.log(`giocatori: ${giocatori.length}, con notifiche attive: ` +
              giocatori.filter((g) => g.iscrizioni.length).length);

  // Prima gli annunci messi in coda dal pannello di amministrazione: se ce n'è
  // uno in attesa, questo giro serve a spedire quello.
  let inCoda = [];
  try {
    inCoda = await rest('push_annunci?inviato=is.null&order=creato.asc&limit=1');
  } catch (e) {
    // tabella non ancora creata: si va avanti con le notifiche automatiche
  }

  let messaggi;
  let annuncio = null;
  if (!TITOLO && inCoda.length) {
    annuncio = inCoda[0];
    messaggi = giocatori.filter((g) => g.iscrizioni.length).map((g) => ({
      user_id: g.user_id, iscrizioni: g.iscrizioni, tipo: 'annuncio',
      titolo: annuncio.titolo, testo: annuncio.testo,
    }));
    console.log(`annuncio in coda: "${annuncio.titolo}"`);
  } else if (TITOLO) {
    // annuncio a mano: a tutti quelli iscritti, senza le regole di frequenza
    messaggi = giocatori.filter((g) => g.iscrizioni.length).map((g) => ({
      user_id: g.user_id, iscrizioni: g.iscrizioni, tipo: 'annuncio',
      titolo: TITOLO, testo: TESTO || '',
    }));
  } else {
    messaggi = decidi(giocatori);
  }

  if (!messaggi.length) {
    console.log('nessuna notifica da mandare.');
  }
  for (const m of messaggi) {
    console.log(`  → ${m.tipo.padEnd(12)} ${m.titolo}: ${m.testo}`);
  }

  if (!MANDA) {
    console.log('\n(prova a vuoto: non è stato spedito niente. Aggiungi --manda per inviare.)');
    return;
  }
  if (!PUB || !PRIV) {
    console.log('Mancano le chiavi VAPID: impossibile spedire.');
    process.exit(1);
  }

  const webpush = (await import('web-push')).default;
  webpush.setVapidDetails(MITTENTE, PUB, PRIV);

  let inviate = 0;
  let scadute = 0;
  for (const m of messaggi) {
    const carico = JSON.stringify({ titolo: m.titolo, testo: m.testo, tipo: m.tipo, url: './' });
    for (const i of m.iscrizioni) {
      try {
        await webpush.sendNotification(
          { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, carico);
        inviate++;
      } catch (e) {
        // 404 e 410: iscrizione morta (app disinstallata, permesso revocato).
        // Va cancellata, altrimenti resta lì per sempre a far fallire gli invii.
        if (e.statusCode === 404 || e.statusCode === 410) {
          scadute++;
          await fetch(`${URL}/rest/v1/push_iscrizioni?endpoint=eq.${encodeURIComponent(i.endpoint)}`, {
            method: 'DELETE',
            headers: { apikey: SERVIZIO, Authorization: `Bearer ${SERVIZIO}` },
          });
        } else {
          console.error(`  errore su un'iscrizione: ${e.statusCode || ''} ${e.message}`);
        }
      }
    }
  }

  // L'annuncio spedito va segnato, altrimenti ripartirebbe a ogni giro
  if (annuncio) {
    await fetch(`${URL}/rest/v1/push_annunci?id=eq.${annuncio.id}`, {
      method: 'PATCH',
      headers: {
        apikey: SERVIZIO, Authorization: `Bearer ${SERVIZIO}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify({ inviato: new Date().toISOString(), quanti: inviate }),
    });
  }

  // La posizione va aggiornata per TUTTI, anche per chi non ha ricevuto niente:
  // è il confronto della prossima volta.
  const adesso = new Date().toISOString();
  // Gli annunci non consumano il limite dei due giorni: sono eventi eccezionali,
  // e non è giusto che rubino la notifica automatica di chi ne avrebbe bisogno.
  const inviati = new Set(
    messaggi.filter((m) => m.tipo !== 'annuncio').map((m) => m.user_id));
  await scrivi('push_stato', giocatori.map((g) => {
    const s = { user_id: g.user_id, posizione: g.posizione, tipi_inviati: g.tipiInviati };
    if (inviati.has(g.user_id)) {
      const tipo = (messaggi.find((m) => m.user_id === g.user_id) || {}).tipo;
      s.ultima_inviata = adesso;
      s.ultimo_tipo = tipo;
      // memoria per le notifiche da mandare una volta sola
      if (tipo && !s.tipi_inviati.includes(tipo)) s.tipi_inviati = [...s.tipi_inviati, tipo];
    }
    return s;
  }), true);

  console.log(`\ninviate: ${inviate}, iscrizioni scadute rimosse: ${scadute}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
