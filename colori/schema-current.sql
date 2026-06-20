-- Schema snapshot — progetto Supabase "incomune-colori" (ssehydigsdydmhulotws, EU)
-- Migration: init_colori_torneo (2026-06-20)
-- Dedicato al torneo colori, isolato dal DB di produzione.

create extension if not exists "pgcrypto";

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  nickname text,
  round int not null,
  candidate_a text not null,
  candidate_b text not null,
  winner text not null,
  created_at timestamptz not null default now(),
  constraint winner_is_contestant check (winner = candidate_a or winner = candidate_b),
  constraint nickname_len check (nickname is null or char_length(nickname) <= 40)
);

alter table public.votes enable row level security;

-- anon: solo INSERT, nessuna lettura della tabella grezza.
-- WARN "RLS Policy Always True" atteso: voto pubblico anonimo (per scelta).
create policy "anon can insert votes"
  on public.votes for insert
  to anon
  with check (true);

-- Aggregati esposti SOLO via RPC (security definer); anon non ha SELECT sulla tabella.
-- WARN "Public Can Execute SECURITY DEFINER" atteso: la classifica e deliberatamente pubblica.
create or replace function public.color_leaderboard()
returns table (
  color_key text,
  appearances bigint,
  wins bigint,
  win_rate numeric,
  champion_count bigint
)
language sql
security definer
set search_path = public
as $$
  with appear as (
    select candidate_a as k from votes
    union all
    select candidate_b as k from votes
  ),
  app_counts as (
    select k, count(*) as appearances from appear group by k
  ),
  win_counts as (
    select winner as k, count(*) as wins from votes group by winner
  ),
  -- campione finale = vincitore del round massimo per ciascuna sessione
  champ as (
    select v.winner as k
    from votes v
    join (
      select session_id, max(round) as max_round
      from votes group by session_id
    ) m on m.session_id = v.session_id and m.max_round = v.round
  ),
  champ_counts as (
    select k, count(*) as champion_count from champ group by k
  )
  select
    a.k as color_key,
    a.appearances,
    coalesce(w.wins, 0) as wins,
    round(coalesce(w.wins,0)::numeric / nullif(a.appearances,0), 3) as win_rate,
    coalesce(c.champion_count, 0) as champion_count
  from app_counts a
  left join win_counts w on w.k = a.k
  left join champ_counts c on c.k = a.k
  order by win_rate desc nulls last, a.appearances desc;
$$;

grant execute on function public.color_leaderboard() to anon;
