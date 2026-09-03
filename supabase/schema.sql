-- =====================================================================
--  Beeppy - schema del database
--  Da eseguire una sola volta nel SQL Editor del progetto Supabase.
--
--  Principio di sicurezza: il client NON può scrivere direttamente nella
--  tabella dei punteggi. Può solo chiamare submit_score(), che decide se
--  il punteggio è plausibile e aggiorna il record solo se è migliore.
-- =====================================================================

-- ------------------------------------------------------------------ profili
create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  nickname   text not null check (char_length(nickname) between 3 and 16),
  created_at timestamptz not null default now()
);

-- Segna chi ha una foto profilo e quando: la colonna sta qui, con la tabella,
-- perché la vista della classifica la legge (vedi più sotto).
alter table public.profiles add column if not exists avatar_at timestamptz;

-- nickname unici senza distinzione fra maiuscole e minuscole
create unique index if not exists profiles_nickname_lower_idx
  on public.profiles (lower(nickname));

alter table public.profiles enable row level security;

-- La classifica è riservata a chi ha un account: nickname e punteggi si leggono
-- solo dopo l'accesso. Nasconderli nell'interfaccia non basterebbe — con la
-- chiave pubblica chiunque interrogherebbe le tabelle da fuori — quindi la
-- chiusura sta qui, dove è l'unica che conta.
drop policy if exists "profili leggibili da tutti" on public.profiles;
drop policy if exists "profili leggibili da chi ha l'accesso" on public.profiles;
create policy "profili leggibili da chi ha l'accesso"
  on public.profiles for select using (auth.uid() is not null);

-- ------------------------------------------------------------------ punteggi
create table if not exists public.scores (
  user_id      uuid primary key references auth.users on delete cascade,
  best_score   int  not null default 0 check (best_score >= 0 and best_score <= 10000),
  games_played int  not null default 0,
  total_flaps  bigint not null default 0,
  last_submit  timestamptz,
  updated_at   timestamptz not null default now()
);

create index if not exists scores_best_idx
  on public.scores (best_score desc, updated_at asc);

alter table public.scores enable row level security;

drop policy if exists "punteggi leggibili da tutti" on public.scores;
drop policy if exists "punteggi leggibili da chi ha l'accesso" on public.scores;
create policy "punteggi leggibili da chi ha l'accesso"
  on public.scores for select using (auth.uid() is not null);
-- nessuna policy di insert/update/delete: si scrive solo via submit_score()

-- ------------------------------------------------ storico delle partite
--  Serve alla scheda profilo: senza, il profilo mostra solo totali; con, mostra
--  l'andamento. Ogni riga è una partita accettata (quelle scartate dai controlli
--  di plausibilità non entrano: lo storico deve raccontare partite vere).
create table if not exists public.games (
  id          bigserial primary key,
  user_id     uuid not null references auth.users on delete cascade,
  score       int  not null check (score >= 0 and score <= 10000),
  duration_ms int  not null,
  flaps       int  not null,
  created_at  timestamptz not null default now()
);

create index if not exists games_user_idx on public.games (user_id, created_at desc);

alter table public.games enable row level security;

drop policy if exists "ognuno vede le proprie partite" on public.games;
create policy "ognuno vede le proprie partite"
  on public.games for select using (auth.uid() = user_id);
-- nessuna policy di scrittura: le righe le mette submit_score()

-- --------------------------------------------- configurazione del gioco
--  Valori che si cambiano senza ripubblicare il sito. Leggibili da tutti
--  (servono al gioco), scrivibili solo dagli amministratori.
create table if not exists public.app_config (
  chiave     text primary key,
  valore     text,
  aggiornato timestamptz not null default now()
);

alter table public.app_config enable row level security;

drop policy if exists "configurazione leggibile da tutti" on public.app_config;
create policy "configurazione leggibile da tutti"
  on public.app_config for select using (true);
-- nessuna policy di scrittura: si passa da admin_set_config()

-- ---------------------------------------------------- dati di contatto
--  Tabella separata da profiles, e non è pignoleria: profiles è leggibile da
--  ogni giocatore registrato (serve per la classifica), quindi mettere qui
--  dentro email e telefono significherebbe che chiunque si iscrive può leggere
--  i recapiti di tutti. Qui invece ognuno vede solo i propri.
create table if not exists public.contatti (
  user_id   uuid primary key references auth.users on delete cascade,
  nome      text check (nome is null or char_length(nome) <= 60),
  cognome   text check (cognome is null or char_length(cognome) <= 60),
  email     text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'),
  telefono  text check (telefono is null or telefono ~ '^[0-9 +().-]{6,25}$'),
  creato    timestamptz not null default now(),
  aggiornato timestamptz not null default now()
);

create index if not exists contatti_email_idx on public.contatti (lower(email));

alter table public.contatti enable row level security;

drop policy if exists "ognuno vede i propri contatti" on public.contatti;
create policy "ognuno vede i propri contatti"
  on public.contatti for select using (auth.uid() = user_id);

drop policy if exists "ognuno aggiorna i propri contatti" on public.contatti;
create policy "ognuno aggiorna i propri contatti"
  on public.contatti for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
-- Chi si è iscritto prima che l'email diventasse obbligatoria non ha questa
-- riga: deve poterla creare, altrimenti resterebbe senza modo di aggiungere il
-- proprio indirizzo. Può creare solo la propria, e la chiave primaria impedisce
-- i doppioni.
drop policy if exists "ognuno crea i propri contatti" on public.contatti;
create policy "ognuno crea i propri contatti"
  on public.contatti for insert to authenticated
  with check (auth.uid() = user_id);


insert into public.app_config (chiave, valore) values
  ('annuncio', ''),
  ('registrazioni_aperte', 'si'),
  -- 'si' obbliga ad aggiungere il gioco alla schermata Home per giocare.
  -- Sta qui e non nel codice perché è una decisione da provare e poter
  -- disfare in dieci secondi: chi arriva dal browser interno di WhatsApp non
  -- può installare niente, e un blocco rigido lo perderesti per sempre.
  ('richiedi_installazione', 'no'),
  -- 'si' toglie il "Più tardi" dalla schermata delle notifiche. Attenzione:
  -- chi ha già rifiutato il permesso non può più concederlo dal browser, e chi
  -- apre da Safari senza aver installato il gioco non può accettare affatto —
  -- quelli passano comunque, altrimenti resterebbero chiusi fuori per sempre.
  ('notifiche_obbligatorie', 'no')
on conflict (chiave) do nothing;



-- ------------------------------------------------- nickname: filtro anti-spam
--  La classifica è pubblica, quindi il nickname è il posto dove arriva lo spam
--  (link, nomi commerciali, finti account ufficiali). Questa funzione è la
--  regola unica: la usano il vincolo della tabella, il trigger di
--  registrazione e il controllo di disponibilità.
create or replace function public.nickname_ok(p text)
returns boolean
language sql
immutable
as $$
  select p is not null
     and p ~ '^[A-Za-z0-9._-]{3,16}$'          -- solo caratteri innocui
     and p ~ '[A-Za-z]'                         -- almeno una lettera
     and p !~ '(.)\1{3,}'                      -- non 4 caratteri uguali di fila
     and p !~* '(https?|www\.)'                 -- niente indirizzi web
     and p !~* '\.(com|it|net|org|io|xyz|ru|shop|online)([^a-z]|$)'
     and p !~* '(viagra|casino|scommesse|porno|xxx|forex|bitcoin|crypto|guadagn)'
     and lower(p) not in ('admin','administrator','amministratore','moderator','mod',
                          'root','support','staff','system','beeppy','official',
                          'ufficiale','null','undefined');
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_nickname_ok') then
    alter table public.profiles
      add constraint profiles_nickname_ok check (public.nickname_ok(nickname));
  end if;
end
$$;

-- ------------------------------------------- profilo creato alla registrazione
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_nick text := coalesce(new.raw_user_meta_data->>'nickname',
                          'ape_' || substr(new.id::text, 1, 6));
  v_aperte text;
  v_email  text;
begin
  -- L'interruttore "registrazioni aperte" dell'area admin va fatto rispettare
  -- qui, non nell'interfaccia: un client manomesso salterebbe qualsiasi
  -- controllo scritto nel browser.
  select valore into v_aperte from public.app_config where chiave = 'registrazioni_aperte';
  if coalesce(v_aperte, 'si') <> 'si' then
    raise exception 'registrazioni chiuse';
  end if;

  if not public.nickname_ok(v_nick) then
    raise exception 'nickname non ammesso: %', v_nick;
  end if;
  insert into public.profiles (id, nickname) values (new.id, v_nick);
  insert into public.scores (user_id) values (new.id);

  -- I dati di contatto arrivano dai metadati della registrazione: così entrano
  -- nella stessa transazione dell'account, e non può esistere un iscritto senza
  -- email. L'email è obbligatoria, il resto no.
  v_email := nullif(trim(new.raw_user_meta_data->>'email_contatto'), '');
  if v_email is null then
    raise exception 'email obbligatoria';
  end if;
  insert into public.contatti (user_id, nome, cognome, email, telefono)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data->>'nome'), ''),
    nullif(trim(new.raw_user_meta_data->>'cognome'), ''),
    v_email,
    nullif(trim(new.raw_user_meta_data->>'telefono'), '')
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------- classifica
create or replace view public.leaderboard
with (security_invoker = on) as
select
  row_number() over (order by s.best_score desc, s.updated_at asc) as pos,
  p.nickname,
  s.best_score,
  s.updated_at,
  s.user_id,
  p.avatar_at
from public.scores s
join public.profiles p on p.id = s.user_id
where s.best_score > 0;

-- Doppia chiusura: la vista ha security_invoker, quindi eredita già le policy
-- di chi la interroga, ma togliere il permesso agli anonimi rende la cosa
-- esplicita a chi legge lo schema.
revoke select on public.leaderboard from anon;
grant  select on public.leaderboard to authenticated;

-- ------------------------------------------------- classifica settimanale
--  Il meglio di ciascuno negli ultimi sette giorni. Serve a dare una speranza
--  a chi arriva dopo: quando i record di sempre saranno alti, una classifica
--  che riparte è l'unica in cui un nuovo iscritto può ancora arrivare primo.
--
--  Perche' una funzione e non una vista: le partite in `games` sono leggibili
--  da ciascuno solo per le proprie righe (e cosi' deve restare, sono uno
--  storico personale). Una vista con security_invoker mostrerebbe a ognuno
--  soltanto se stesso. Questa funzione gira con i privilegi del proprietario e
--  restituisce esattamente le stesse informazioni della classifica di sempre —
--  nickname e punteggio — quindi non svela niente di nuovo.
create or replace function public.leaderboard_settimana(p_limit int default 50)
returns table (pos bigint, nickname text, best_score int, user_id uuid, avatar_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  with meglio as (
    select g.user_id, max(g.score) as best_score, min(g.created_at) as quando
    from public.games g
    where g.created_at >= now() - interval '7 days'
      and g.score > 0
    group by g.user_id
  )
  select
    row_number() over (order by m.best_score desc, m.quando asc) as pos,
    p.nickname,
    m.best_score,
    m.user_id,
    p.avatar_at
  from meglio m
  join public.profiles p on p.id = m.user_id
  order by pos
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

-- Come la classifica di sempre: riservata a chi ha un account.
revoke all on function public.leaderboard_settimana(int) from public, anon;
grant execute on function public.leaderboard_settimana(int) to authenticated;

-- ------------------------------------- nickname utilizzabile? (pre-controllo)
--  Ritorna 'ok', 'occupato' oppure 'non_ammesso', così la schermata di
--  registrazione può dire subito qual è il problema invece di far fallire
--  la registrazione con un errore tecnico.
create or replace function public.nickname_status(p_nick text)
returns text
language sql
security definer set search_path = public
stable
as $$
  select case
    when not public.nickname_ok(p_nick) then 'non_ammesso'
    when exists (select 1 from public.profiles where lower(nickname) = lower(p_nick)) then 'occupato'
    else 'ok'
  end;
$$;

-- Questa resta aperta agli anonimi: serve durante la registrazione, cioè
-- quando un account non c'è ancora. È security definer, quindi non apre le
-- tabelle: risponde solo "ok", "occupato" o "non_ammesso".
grant execute on function public.nickname_status(text) to anon, authenticated;
drop function if exists public.nickname_available(text);

-- ------------------------------------------------------- invio del punteggio
--  Controlli anti-cheat "di base":
--   1. solo utenti autenticati;
--   2. tetto massimo assoluto;
--   3. rate limit (un invio ogni 2 secondi);
--   4. plausibilità: servono almeno ~0.7 s di gioco per punto e almeno
--      mezzo battito d'ali per punto (nel gioco reale servono ~1 s e ~2.5
--      battiti per punto, quindi la soglia è prudente);
--   5. il record sale, mai scende.
create or replace function public.submit_score(
  p_score       int,
  p_duration_ms int,
  p_flaps       int
)
returns table (best int, is_record boolean, reason text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_old  int;
  v_last timestamptz;
  v_min_ms int;
begin
  if v_user is null then
    raise exception 'utente non autenticato';
  end if;
  if p_score is null or p_score < 0 or p_score > 10000
     or p_duration_ms is null or p_duration_ms < 0
     or p_flaps is null or p_flaps < 0 then
    raise exception 'parametri non validi';
  end if;

  select best_score, last_submit into v_old, v_last
    from public.scores where user_id = v_user for update;

  if not found then
    insert into public.scores (user_id) values (v_user)
      on conflict (user_id) do nothing;
    v_old := 0;
    v_last := null;
  end if;

  if v_last is not null and v_last > now() - interval '2 seconds' then
    return query select v_old, false, 'rate_limit';
    return;
  end if;

  v_min_ms := greatest(0, p_score * 700 - 1500);
  if p_duration_ms < v_min_ms or p_flaps * 2 < p_score then
    update public.scores
       set games_played = games_played + 1, last_submit = now()
     where user_id = v_user;
    return query select v_old, false, 'implausibile';
    return;
  end if;

  update public.scores
     set games_played = games_played + 1,
         total_flaps  = total_flaps + least(p_flaps, 100000),
         last_submit  = now(),
         best_score   = greatest(best_score, p_score),
         updated_at   = case when p_score > best_score then now() else updated_at end
   where user_id = v_user;

  -- storico: solo le partite accettate, così racconta partite vere.
  -- L'inserimento sta qui e non in una policy perché la tabella games non ha
  -- policy di scrittura: l'unica via per entrarci è passare da questi controlli.
  insert into public.games (user_id, score, duration_ms, flaps)
  values (v_user, p_score, p_duration_ms, least(p_flaps, 100000));

  return query select greatest(v_old, p_score), (p_score > v_old), 'ok';
end;
$$;

revoke execute on function public.submit_score(int, int, int) from anon, public;
grant  execute on function public.submit_score(int, int, int) to authenticated;

-- =====================================================================
--  AGGIUNTA — eseguibile anche su un database dove lo schema c'è già.
--  Tutto è "create or replace", quindi rieseguire l'intero file è sicuro.
--
--  Nota: le statistiche del profilo (partite, battiti d'ali, iscritto dal,
--  posizione) NON hanno bisogno di funzioni dedicate: profiles e scores sono
--  già leggibili grazie alle policy RLS, quindi il client le prende da lì.
-- =====================================================================

-- --------------------------------------------- cancellazione dell'account
--  Chi si registra deve potersi cancellare, e Apple lo pretende (5.1.1v) da
--  qualunque app che permetta di creare un account.
--
--  Cancellare da auth.users richiede privilegi che il client non ha: questa
--  funzione è security definer, quindi gira coi permessi del proprietario, ma
--  può colpire SOLO la riga di chi la chiama (auth.uid()). Profilo e punteggi
--  se ne vanno in cascata grazie ai vincoli delle tabelle.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'utente non autenticato';
  end if;
  delete from auth.users where id = v_user;
end;
$$;

revoke execute on function public.delete_my_account() from anon, public;
grant  execute on function public.delete_my_account() to authenticated;

-- --------------------------------------------- recupero del PIN dimenticato
--  Senza email non esiste il classico "ti mandiamo un link". La soluzione è un
--  codice di recupero mostrato una volta sola alla registrazione: chi lo
--  conserva può rimettere il PIN, chi lo perde no. Meglio di niente, che è
--  quello che c'era prima.
--
--  Del codice il database conserva solo l'impronta SHA-256, mai il codice in
--  chiaro: se qualcuno leggesse la tabella non potrebbe usarlo.
alter table public.profiles add column if not exists recovery_hash text;
alter table public.profiles add column if not exists recovery_fails int not null default 0;
alter table public.profiles add column if not exists recovery_locked_until timestamptz;

-- Il codice lo imposta il proprietario, una volta, alla registrazione.
create or replace function public.set_recovery_code(p_hash text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'utente non autenticato';
  end if;
  if p_hash is null or char_length(p_hash) <> 64 then
    raise exception 'impronta non valida';
  end if;
  update public.profiles set recovery_hash = p_hash where id = auth.uid();
end;
$$;

revoke execute on function public.set_recovery_code(text) from anon, public;
grant  execute on function public.set_recovery_code(text) to authenticated;

--  Rimette il PIN a chi presenta nickname e codice giusti. Deve poter essere
--  chiamata da chi NON è autenticato (è tutto il punto), quindi ha tre freni:
--  l'impronta del codice deve combaciare, cinque tentativi sbagliati bloccano
--  il nickname per un'ora, e non rivela mai se un nickname esista o no.
create or replace function public.reset_pin_with_code(
  p_nick      text,
  p_code_hash text,
  p_password  text
)
returns text
language plpgsql
security definer set search_path = public, extensions, auth
as $$
declare
  v_id     uuid;
  v_hash   text;
  v_fails  int;
  v_locked timestamptz;
begin
  select id, recovery_hash, recovery_fails, recovery_locked_until
    into v_id, v_hash, v_fails, v_locked
    from public.profiles where lower(nickname) = lower(p_nick);

  -- nickname inesistente: stessa risposta di codice sbagliato, per non
  -- permettere di scoprire quali nickname esistono
  if v_id is null then
    return 'no';
  end if;

  if v_locked is not null and v_locked > now() then
    return 'bloccato';
  end if;

  if v_hash is null then
    return 'senza_codice';
  end if;

  if v_hash <> p_code_hash then
    update public.profiles
       set recovery_fails = recovery_fails + 1,
           recovery_locked_until = case when recovery_fails + 1 >= 5
                                        then now() + interval '1 hour' else null end
     where id = v_id;
    return 'no';
  end if;

  -- GoTrue conserva le password come hash bcrypt: questo formato lo accetta
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10))
   where id = v_id;

  -- il codice è servito: si azzera, così non resta valido per sempre
  update public.profiles
     set recovery_hash = null, recovery_fails = 0, recovery_locked_until = null
   where id = v_id;

  return 'ok';
end;
$$;

grant execute on function public.reset_pin_with_code(text, text, text) to anon, authenticated;

-- =====================================================================
--  AREA AMMINISTRATORE
--
--  Principio: i permessi stanno QUI, non nell'interfaccia. Il pannello admin
--  nel gioco si limita a nascondere dei pulsanti, e nascondere non è
--  proteggere: chiunque può modificare il JavaScript nel proprio browser.
--  Ogni funzione qui sotto ricontrolla da sé che chi chiama sia amministratore,
--  quindi un client manomesso non ottiene niente.
-- =====================================================================

alter table public.profiles add column if not exists is_admin boolean not null default false;

-- COME CREARSI UN ACCOUNT AMMINISTRATORE
--
-- L'amministratore è un account a parte, con email e password vere: non il
-- proprio account di gioco, che ha un PIN di quattro cifre e non è una
-- credenziale adatta a cancellare utenti.
--
--   1. Dashboard Supabase → Authentication → Users → "Add user"
--      email: la tua, password: lunga e solo per questo scopo.
--      (Il trigger creerà un profilo con un nickname automatico: normale.)
--   2. Poi esegui qui sotto, con la stessa email:
--
--        update public.profiles set is_admin = true
--         where id = (select id from auth.users where email = 'tua@email.it');
--
--   3. Entra da https://tuosito/admin.html con quelle credenziali.
--
-- È volutamente manuale: dall'applicazione non esiste nessun modo di
-- auto-promuoversi amministratore.

create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

grant execute on function public.is_admin() to authenticated;

-- ------------------------------------------------ elenco dei giocatori
create or replace function public.admin_players()
returns table (
  id           uuid,
  nickname     text,
  best_score   int,
  games_played int,
  total_flaps  bigint,
  ultima       timestamptz,
  iscritto     timestamptz,
  admin        boolean
)
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'non autorizzato';
  end if;
  return query
    select p.id, p.nickname, coalesce(s.best_score, 0), coalesce(s.games_played, 0),
           coalesce(s.total_flaps, 0), s.last_submit, p.created_at, p.is_admin
      from public.profiles p
      left join public.scores s on s.user_id = p.id
     order by coalesce(s.best_score, 0) desc, p.created_at asc;
end;
$$;

revoke execute on function public.admin_players() from anon, public;
grant  execute on function public.admin_players() to authenticated;

-- --------------------------------------- contatti visibili all'amministratore
create or replace function public.admin_contatti(p_id uuid)
returns table (nome text, cognome text, email text, telefono text)
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'non autorizzato';
  end if;
  return query
    select c.nome, c.cognome, c.email, c.telefono
      from public.contatti c where c.user_id = p_id;
end;
$$;

revoke execute on function public.admin_contatti(uuid) from anon, public;
grant  execute on function public.admin_contatti(uuid) to authenticated;

-- ------------------------------- cancellare un giocatore (spam, abusi)
create or replace function public.admin_delete_user(p_id uuid)
returns void
language plpgsql
security definer set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'non autorizzato';
  end if;
  if p_id = auth.uid() then
    raise exception 'per cancellare il tuo account usa il profilo, non l''area admin';
  end if;
  delete from auth.users where id = p_id;
end;
$$;

revoke execute on function public.admin_delete_user(uuid) from anon, public;
grant  execute on function public.admin_delete_user(uuid) to authenticated;

-- ------------------------- azzerare il punteggio di un sospetto imbroglione
--  Più proporzionato della cancellazione: l'account resta, il record no.
create or replace function public.admin_reset_score(p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'non autorizzato';
  end if;
  update public.scores set best_score = 0, updated_at = now() where user_id = p_id;
  delete from public.games where user_id = p_id;
end;
$$;

revoke execute on function public.admin_reset_score(uuid) from anon, public;
grant  execute on function public.admin_reset_score(uuid) to authenticated;

create or replace function public.admin_set_config(p_chiave text, p_valore text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'non autorizzato';
  end if;
  if p_chiave not in ('annuncio', 'registrazioni_aperte', 'richiedi_installazione',
                      'notifiche_obbligatorie') then
    raise exception 'chiave non ammessa';
  end if;
  if char_length(coalesce(p_valore, '')) > 200 then
    raise exception 'valore troppo lungo';
  end if;
  insert into public.app_config (chiave, valore, aggiornato)
       values (p_chiave, p_valore, now())
  on conflict (chiave) do update set valore = excluded.valore, aggiornato = now();
end;
$$;

revoke execute on function public.admin_set_config(text, text) from anon, public;
grant  execute on function public.admin_set_config(text, text) to authenticated;

-- ------------------------------------------------------ numeri d'insieme
create or replace function public.admin_stats()
returns table (
  giocatori      int,
  in_classifica  int,
  partite_totali bigint,
  partite_oggi   bigint,
  nuovi_oggi     int
)
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'non autorizzato';
  end if;
  return query select
    (select count(*)::int from public.profiles),
    (select count(*)::int from public.scores where best_score > 0),
    (select coalesce(sum(games_played), 0)::bigint from public.scores),
    (select count(*)::bigint from public.games where created_at > now() - interval '1 day'),
    (select count(*)::int from public.profiles where created_at > now() - interval '1 day');
end;
$$;

revoke execute on function public.admin_stats() from anon, public;
grant  execute on function public.admin_stats() to authenticated;

-- =====================================================================
--  FOTO PROFILO
--
--  Il bucket si crea da qui e non dal pannello: così tutta la
--  configurazione del progetto sta in questo file, e chi lo esegue ottiene
--  un database completo senza dover ricordare passaggi manuali.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatar', 'avatar', true, 262144, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update
  set public = true,
      file_size_limit = 262144,               -- 256 KB: il client ridimensiona prima
      allowed_mime_types = array['image/jpeg', 'image/webp', 'image/png'];

-- Le foto sono pubbliche in lettura: compaiono in classifica accanto al
-- nickname, come l'avatar disegnato.
drop policy if exists "avatar leggibili da tutti" on storage.objects;
create policy "avatar leggibili da tutti"
  on storage.objects for select
  using (bucket_id = 'avatar');

-- Ognuno può scrivere SOLO il file che porta il proprio identificativo: il
-- nome del file è <user_id>.jpg, e la policy lo verifica. Senza questo
-- controllo chiunque potrebbe sovrascrivere la foto di un altro.
drop policy if exists "ognuno carica il proprio avatar" on storage.objects;
create policy "ognuno carica il proprio avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatar'
    and (storage.foldername(name))[1] is null
    and split_part(name, '.', 1) = auth.uid()::text
  );

drop policy if exists "ognuno aggiorna il proprio avatar" on storage.objects;
create policy "ognuno aggiorna il proprio avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatar' and split_part(name, '.', 1) = auth.uid()::text);

-- Cancellare: il proprietario, oppure un amministratore (serve per rimuovere
-- una foto inadatta: la vedono tutti in classifica).
drop policy if exists "cancella il proprio avatar o da admin" on storage.objects;
create policy "cancella il proprio avatar o da admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatar'
    and (split_part(name, '.', 1) = auth.uid()::text or public.is_admin())
  );

-- Segna chi ha una foto e quando: serve a non chiedere immagini inesistenti e
-- a far aggiornare la copia in cache del browser quando cambia.
alter table public.profiles add column if not exists avatar_at timestamptz;

create or replace function public.set_avatar(p_presente boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'utente non autenticato';
  end if;
  update public.profiles
     set avatar_at = case when p_presente then now() else null end
   where id = auth.uid();
end;
$$;

revoke execute on function public.set_avatar(boolean) from anon, public;
grant  execute on function public.set_avatar(boolean) to authenticated;

-- =====================================================================
--  NOTIFICHE PUSH
--
--  Su iPhone le notifiche web arrivano SOLO a chi ha aggiunto il gioco alla
--  schermata Home (da iOS 16.4). Su Android anche dal browser.
--
--  Chi le spedisce è un lavoro programmato su GitHub Actions: la chiave
--  privata necessaria per firmarle non può stare nel browser, e questa è la
--  strada che non richiede di installare nulla.
-- =====================================================================

create table if not exists public.push_iscrizioni (
  id         bigserial primary key,
  user_id    uuid not null references auth.users on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  creato     timestamptz not null default now(),
  ultimo_uso timestamptz
);

create index if not exists push_iscrizioni_user_idx on public.push_iscrizioni (user_id);

alter table public.push_iscrizioni enable row level security;

-- Ognuno vede e gestisce solo le proprie iscrizioni. Chi spedisce le legge
-- con la chiave di servizio, che scavalca le policy per definizione.
drop policy if exists "ognuno vede le proprie iscrizioni push" on public.push_iscrizioni;
create policy "ognuno vede le proprie iscrizioni push"
  on public.push_iscrizioni for select using (auth.uid() = user_id);

drop policy if exists "ognuno crea le proprie iscrizioni push" on public.push_iscrizioni;
create policy "ognuno crea le proprie iscrizioni push"
  on public.push_iscrizioni for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "ognuno cancella le proprie iscrizioni push" on public.push_iscrizioni;
create policy "ognuno cancella le proprie iscrizioni push"
  on public.push_iscrizioni for delete using (auth.uid() = user_id);

--  Memoria di cosa è già stato mandato a chi: serve a due cose diverse e
--  entrambe importanti. A capire chi è stato superato (confrontando la
--  posizione con quella dell'ultima volta) e a non diventare uno spammone —
--  una notifica ogni due giorni per persona, non una al giorno.
create table if not exists public.push_stato (
  user_id        uuid primary key references auth.users on delete cascade,
  posizione      int,
  ultima_inviata timestamptz,
  ultimo_tipo    text,
  -- Elenco dei tipi già spediti a questa persona. Serve alle notifiche che
  -- vanno mandate UNA VOLTA SOLA: guardare ultimo_tipo non basta, perché
  -- viene sovrascritto dalla notifica successiva e quella "una volta sola"
  -- tornerebbe a partire.
  tipi_inviati   text[] not null default '{}'
);

alter table public.push_stato add column if not exists tipi_inviati text[] not null default '{}';

alter table public.push_stato enable row level security;
-- nessuna policy: ci accede solo chi spedisce, con la chiave di servizio

-- ------------------------------------------- annunci in coda e riepilogo push
--  L'amministratore scrive un annuncio dal pannello; lo spedisce il lavoro
--  programmato al giro successivo. Il pannello non può spedire da sé: firmare
--  una notifica richiede la chiave privata, che nel browser sarebbe leggibile.
create table if not exists public.push_annunci (
  id      bigserial primary key,
  titolo  text not null check (char_length(titolo) between 1 and 60),
  testo   text not null check (char_length(testo) <= 160),
  creato  timestamptz not null default now(),
  inviato timestamptz,
  quanti  int
);

alter table public.push_annunci enable row level security;

drop policy if exists "annunci leggibili dagli admin" on public.push_annunci;
create policy "annunci leggibili dagli admin"
  on public.push_annunci for select using (public.is_admin());
-- scrittura solo via admin_accoda_annuncio(); l'invio li aggiorna con la chiave
-- di servizio, che scavalca le policy

create or replace function public.admin_accoda_annuncio(p_titolo text, p_testo text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'non autorizzato';
  end if;
  insert into public.push_annunci (titolo, testo) values (trim(p_titolo), trim(p_testo));
end;
$$;

revoke execute on function public.admin_accoda_annuncio(text, text) from anon, public;
grant  execute on function public.admin_accoda_annuncio(text, text) to authenticated;

--  Numeri per il pannello: quante persone riceveranno le notifiche e cosa è
--  già partito.
create or replace function public.admin_push_riepilogo()
returns table (
  iscritti        int,
  dispositivi     int,
  ultimo_invio    timestamptz,
  annunci_in_coda int
)
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'non autorizzato';
  end if;
  return query select
    (select count(distinct user_id)::int from public.push_iscrizioni),
    (select count(*)::int from public.push_iscrizioni),
    (select max(ultima_inviata) from public.push_stato),
    (select count(*)::int from public.push_annunci where inviato is null);
end;
$$;

revoke execute on function public.admin_push_riepilogo() from anon, public;
grant  execute on function public.admin_push_riepilogo() to authenticated;
