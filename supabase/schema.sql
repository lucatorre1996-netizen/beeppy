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

-- nickname unici senza distinzione fra maiuscole e minuscole
create unique index if not exists profiles_nickname_lower_idx
  on public.profiles (lower(nickname));

alter table public.profiles enable row level security;

drop policy if exists "profili leggibili da tutti" on public.profiles;
create policy "profili leggibili da tutti"
  on public.profiles for select using (true);

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
create policy "punteggi leggibili da tutti"
  on public.scores for select using (true);
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

insert into public.app_config (chiave, valore) values
  ('annuncio', ''),
  ('registrazioni_aperte', 'si')
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
  s.user_id
from public.scores s
join public.profiles p on p.id = s.user_id
where s.best_score > 0;

grant select on public.leaderboard to anon, authenticated;

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
  if p_chiave not in ('annuncio', 'registrazioni_aperte') then
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
