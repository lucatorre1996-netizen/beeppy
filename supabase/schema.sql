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

-- ------------------------------------------- profilo creato alla registrazione
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data->>'nickname',
                           'ape_' || substr(new.id::text, 1, 6)));
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

-- --------------------------------------------- nickname libero? (pre-controllo)
create or replace function public.nickname_available(p_nick text)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select not exists (select 1 from public.profiles where lower(nickname) = lower(p_nick));
$$;

grant execute on function public.nickname_available(text) to anon, authenticated;

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

  return query select greatest(v_old, p_score), (p_score > v_old), 'ok';
end;
$$;

revoke execute on function public.submit_score(int, int, int) from anon, public;
grant  execute on function public.submit_score(int, int, int) to authenticated;
