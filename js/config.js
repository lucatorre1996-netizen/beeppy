// Configurazione. Compila questi due valori con i dati del tuo progetto Supabase
// (Project Settings -> API). La anon key è pubblica per design: la sicurezza
// è garantita dalle policy RLS definite in supabase/schema.sql.
// Se lasci i valori vuoti il gioco funziona in modalità offline (record locale).
export const SUPABASE_URL = 'https://capyfbcjxkjkyeigciqb.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_5_QrCuMpAcg2U9CKayRb2g_dbgRQvdi';

// Dominio sintetico usato per trasformare il nickname in una email interna,
// dato che Supabase Auth richiede una email. Non viene mai inviata nessuna mail.
export const NICK_DOMAIN = 'beeppy.play';

// Chiave pubblica per le notifiche push, generata con `npm run chiavi-push`.
// È pubblica per definizione: la spedisce il browser a ogni iscrizione. La
// gemella privata sta nei segreti di GitHub e non deve mai finire qui.
// Finché è vuota, le notifiche restano semplicemente spente.
export const VAPID_PUBLIC_KEY = '';

export const ONLINE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const PUSH_ATTIVE = Boolean(VAPID_PUBLIC_KEY);
