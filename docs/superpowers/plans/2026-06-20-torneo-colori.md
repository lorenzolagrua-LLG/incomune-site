# Torneo Colori InComune — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una pagina pubblica su `incomune.app/colori` dove gli amici votano un torneo a eliminazione diretta 1v1 tra 16 colori-candidati per il brand, registrando ogni sfida su un Supabase dedicato per una classifica globale.

**Architecture:** Sito statico vanilla (nessun build step) nel repo `incomune-site`. La logica del bracket vive in un modulo ES puro e testabile (`colori/bracket.js`), testato con il runner integrato di Node. Il rendering DOM e il glue Supabase stanno in `colori/colori.js`. La persistenza è su un nuovo progetto Supabase free dedicato (isolato dalla produzione): tabella `votes` insert-only per anon, aggregati esposti via RPC `color_leaderboard`. Una pagina risultati separata e non linkata legge l'RPC.

**Tech Stack:** HTML/CSS/JS vanilla, ES modules nel browser via `<script type="module">`, `@supabase/supabase-js` da CDN (ESM), Supabase (nuovo progetto EU), Node `--test` per i test del bracket.

## Global Constraints

- **Nessun build step.** Il sito è statico vanilla; non aggiungere bundler, framework o transpiler. JS nel browser via `<script type="module">`.
- **Copy italiano:** niente em dash; usare "team di InComune" (non "di Novoli"); "entità" (non "luogo").
- **Supabase:** progetto NUOVO e dedicato, mai la produzione (`dijicgloszsmomgyxjlf`). Regione EU. Dopo ogni migration: salvare il file in `supabase/migrations/` del nuovo setup + aggiornare `colori/schema-current.sql`.
- **RLS:** la tabella `votes` espone al ruolo `anon` SOLO INSERT. Nessuna SELECT sulla tabella grezza; gli aggregati passano solo dall'RPC.
- **16 candidati** esatti, hex curati (vedi Task 2). Logo iN sempre lo stesso tracciato, cambia solo l'accent.
- **anon key pubblica** nel JS client: è normale e atteso per un sito statico.

---

## File Structure

- `colori/package.json` — `{"type":"module","private":true}` così Node tratta i `.js` come ESM per i test (i browser lo ignorano).
- `colori/bracket.js` — modulo puro: shuffle deterministico + state machine del torneo. Nessun DOM, nessuna rete.
- `colori/bracket.test.js` — test Node del bracket.
- `colori/colors.js` — config dei 16 candidati (`{ key, label, family, hex }`) + export `CANDIDATES`.
- `colori/mockup.js` — funzione pura `renderMockupHTML(candidate)` che ritorna l'HTML della card mini-mockup.
- `colori/colori.js` — glue: stato partita, init Supabase, flusso intro→sfide→finale, INSERT per ogni 1v1, render via `mockup.js`.
- `colori/colori.css` — stili pagina torneo (riusa i token di `../styles.css`).
- `colori/index.html` — pagina torneo.
- `colori/risultati/index.html` — pagina classifica (non linkata).
- `colori/risultati/risultati.js` — legge RPC `color_leaderboard` e renderizza la tabella.
- `colori/schema-current.sql` — snapshot schema del nuovo progetto Supabase.

---

## Task 1: Nuovo progetto Supabase + schema

**Files:**
- Create: `colori/schema-current.sql`
- Create (migration record): contenuto SQL applicato via MCP

**Interfaces:**
- Produces: progetto Supabase con URL + anon key (annotare per Task 5/7); tabella `votes`; RPC `color_leaderboard()` che ritorna righe `{ color_key text, appearances int, wins int, win_rate numeric, champion_count int }`.

- [ ] **Step 1: Creare il progetto Supabase dedicato**

Via MCP Supabase: `list_organizations` → `get_cost` (organization, type "project") → `confirm_cost` → `create_project` con nome `incomune-colori`, regione EU (`eu-central-1`). Annotare `project_id`, project URL e anon (publishable) key via `get_project_url` e `get_publishable_keys`.

- [ ] **Step 2: Applicare la migration schema**

Via MCP `apply_migration` (name `init_colori_torneo`) con questo SQL:

```sql
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

-- anon: solo INSERT, nessuna lettura
create policy "anon can insert votes"
  on public.votes for insert
  to anon
  with check (true);

-- Aggregati esposti SOLO via RPC (security definer), niente SELECT diretta.
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
```

- [ ] **Step 3: Verificare lo schema applicato**

Via MCP `list_tables` (schema `public`) → confermare che `votes` esista con le colonne attese e RLS abilitata. Via MCP `get_advisors` (type `security`) → confermare 0 ERROR sulla nuova tabella/funzione.

- [ ] **Step 4: Smoke test INSERT + RPC**

Via MCP `execute_sql`:

```sql
insert into public.votes (session_id, nickname, round, candidate_a, candidate_b, winner)
values (gen_random_uuid(), 'smoke', 1, 'orange-current', 'blue-novoli', 'orange-current');
select * from public.color_leaderboard();
```
Expected: l'INSERT riesce; l'RPC ritorna almeno 2 righe (orange-current con win_rate 1.0, blue-novoli con 0.0). Poi pulire: `delete from public.votes where nickname = 'smoke';`

- [ ] **Step 5: Salvare lo snapshot schema**

Scrivere il SQL dello Step 2 in `colori/schema-current.sql`.

- [ ] **Step 6: Commit**

```bash
git add colori/schema-current.sql
git commit -m "feat(colori): schema Supabase torneo (votes + RPC color_leaderboard)"
```

---

## Task 2: Config palette (16 candidati)

**Files:**
- Create: `colori/colors.js`

**Interfaces:**
- Produces: `export const CANDIDATES` — array di 16 oggetti `{ key: string, label: string, family: string, hex: string }`. Le `key` sono stabili e usate ovunque (DB, bracket, mockup).

- [ ] **Step 1: Scrivere il file config**

Hex curati per leggibilità del logo/testo bianco sull'header colorato e per coerenza calda del brand.

```js
// colori/colors.js
export const CANDIDATES = [
  // Arancio
  { key: 'orange-current',  label: 'Arancio attuale',   family: 'arancio', hex: '#F17100' },
  { key: 'orange-terra',    label: 'Arancio terracotta', family: 'arancio', hex: '#E0592B' },
  { key: 'orange-zucca',    label: 'Arancio zucca',      family: 'arancio', hex: '#EB8200' },
  // Blu
  { key: 'blue-novoli',     label: 'Blu Novoli',         family: 'blu',     hex: '#1E5FA8' },
  { key: 'blue-petrolio',   label: 'Blu petrolio',       family: 'blu',     hex: '#0E7C86' },
  { key: 'blue-notte',      label: 'Blu notte',          family: 'blu',     hex: '#243B6B' },
  // Verde
  { key: 'green-oliva',     label: 'Verde oliva',        family: 'verde',   hex: '#6B7A2E' },
  { key: 'green-salvia',    label: 'Verde salvia',       family: 'verde',   hex: '#4E7C5B' },
  { key: 'green-bosco',     label: 'Verde bosco',        family: 'verde',   hex: '#2F6B4F' },
  // Viola
  { key: 'violet-prugna',   label: 'Viola prugna',       family: 'viola',   hex: '#7A3E72' },
  { key: 'violet-lilla',    label: 'Lilla',              family: 'viola',   hex: '#8A6BB0' },
  { key: 'violet-melanzana',label: 'Melanzana',          family: 'viola',   hex: '#5B2C5A' },
  // Rosso
  { key: 'red-mattone',     label: 'Rosso mattone',      family: 'rosso',   hex: '#B5402F' },
  { key: 'red-corallo',     label: 'Corallo',            family: 'rosso',   hex: '#E04E3B' },
  // Giallo
  { key: 'yellow-ocra',     label: 'Giallo ocra',        family: 'giallo',  hex: '#C8901C' },
  { key: 'yellow-caldo',    label: 'Giallo caldo',       family: 'giallo',  hex: '#E0A416' },
];
```

- [ ] **Step 2: Verifica conteggio**

Run: `node -e "import('./colori/colors.js').then(m=>{if(m.CANDIDATES.length!==16)throw new Error('atteso 16, trovati '+m.CANDIDATES.length); const keys=new Set(m.CANDIDATES.map(c=>c.key)); if(keys.size!==16)throw new Error('key duplicate'); console.log('OK 16 candidati, key uniche');})"`
Expected: stampa `OK 16 candidati, key uniche`

- [ ] **Step 3: Commit**

```bash
git add colori/colors.js
git commit -m "feat(colori): config 16 candidati colore"
```

---

## Task 3: Motore del bracket (logica pura + test)

**Files:**
- Create: `colori/package.json`
- Create: `colori/bracket.js`
- Test: `colori/bracket.test.js`

**Interfaces:**
- Consumes: niente (modulo puro).
- Produces:
  - `export function shuffle(arr, rng)` → nuovo array mescolato (Fisher-Yates) usando `rng()` ∈ [0,1).
  - `export function createTournament(keys, rng)` → `state`.
  - `export function currentPair(state)` → `[keyA, keyB]` oppure `null` se finito.
  - `export function pick(state, winnerKey)` → `{ state: nextState, matchup: { round, candidate_a, candidate_b, winner } }`.
  - `state` shape: `{ contestants: string[], winners: string[], index: number, round: number, totalRounds: number, champion: string|null }`.

- [ ] **Step 1: Creare il package.json del modulo**

```json
{ "type": "module", "private": true }
```
Salvare in `colori/package.json`.

- [ ] **Step 2: Scrivere i test (failing)**

```js
// colori/bracket.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shuffle, createTournament, currentPair, pick } from './bracket.js';

// rng deterministico che restituisce sempre 0 → Fisher-Yates diventa identità invertita prevedibile
const rng0 = () => 0;

test('shuffle non perde elementi', () => {
  const inp = ['a','b','c','d'];
  const out = shuffle(inp, rng0);
  assert.equal(out.length, 4);
  assert.deepEqual([...out].sort(), [...inp].sort());
  assert.notStrictEqual(out, inp); // nuovo array
});

test('createTournament con 16 ha 4 round', () => {
  const keys = Array.from({length:16}, (_,i)=>'k'+i);
  const s = createTournament(keys, rng0);
  assert.equal(s.totalRounds, 4);
  assert.equal(s.round, 1);
  assert.equal(s.contestants.length, 16);
  assert.equal(s.champion, null);
});

test('currentPair ritorna i primi due contestants', () => {
  const keys = ['a','b','c','d'];
  const s = createTournament(keys, rng0);
  const pair = currentPair(s);
  assert.equal(pair.length, 2);
  assert.equal(s.contestants[0], pair[0]);
  assert.equal(s.contestants[1], pair[1]);
});

test('pick registra il matchup e avanza l indice', () => {
  const keys = ['a','b','c','d'];
  const s0 = createTournament(keys, rng0);
  const [a,b] = currentPair(s0);
  const { state: s1, matchup } = pick(s0, a);
  assert.equal(matchup.winner, a);
  assert.equal(matchup.candidate_a, a);
  assert.equal(matchup.candidate_b, b);
  assert.equal(matchup.round, 1);
  assert.equal(s1.index, 2);
});

test('un bracket da 4 produce un campione in 3 scelte', () => {
  const keys = ['a','b','c','d'];
  let s = createTournament(keys, rng0);
  let picks = 0;
  while (currentPair(s)) {
    const [a] = currentPair(s);
    s = pick(s, a).state; // vince sempre il primo
    picks++;
  }
  assert.equal(picks, 3); // 2 semifinali + 1 finale
  assert.ok(s.champion);
});

test('avanzamento round: dopo aver chiuso il round 1 si passa al round 2', () => {
  const keys = ['a','b','c','d'];
  let s = createTournament(keys, rng0);
  const winner1 = currentPair(s)[0];
  s = pick(s, winner1).state;
  const winner2 = currentPair(s)[0];
  s = pick(s, winner2).state;
  assert.equal(s.round, 2);
  assert.deepEqual(s.contestants, [winner1, winner2]);
  assert.equal(s.index, 0);
});
```

- [ ] **Step 3: Eseguire i test (devono fallire)**

Run: `node --test colori/bracket.test.js`
Expected: FAIL (`Cannot find module './bracket.js'` o export mancanti).

- [ ] **Step 4: Implementare il modulo**

```js
// colori/bracket.js
export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createTournament(keys, rng = Math.random) {
  const contestants = shuffle(keys, rng);
  return {
    contestants,
    winners: [],
    index: 0,
    round: 1,
    totalRounds: Math.ceil(Math.log2(contestants.length)),
    champion: contestants.length === 1 ? contestants[0] : null,
  };
}

export function currentPair(state) {
  if (state.champion) return null;
  const { contestants, index } = state;
  if (index + 1 >= contestants.length + 1 && contestants.length === 1) return null;
  if (index >= contestants.length) return null;
  return [contestants[index], contestants[index + 1]];
}

export function pick(state, winnerKey) {
  const a = state.contestants[state.index];
  const b = state.contestants[state.index + 1];
  const matchup = { round: state.round, candidate_a: a, candidate_b: b, winner: winnerKey };

  const winners = [...state.winners, winnerKey];
  let next = { ...state, winners, index: state.index + 2 };

  if (next.index >= next.contestants.length) {
    // round chiuso
    if (winners.length === 1) {
      next = { ...next, champion: winners[0] };
    } else {
      next = { ...next, contestants: winners, winners: [], index: 0, round: next.round + 1 };
    }
  }
  return { state: next, matchup };
}
```

- [ ] **Step 5: Eseguire i test (devono passare)**

Run: `node --test colori/bracket.test.js`
Expected: PASS (6 test).

- [ ] **Step 6: Commit**

```bash
git add colori/package.json colori/bracket.js colori/bracket.test.js
git commit -m "feat(colori): motore bracket eliminazione diretta + test"
```

---

## Task 4: Mini-mockup (rendering card)

**Files:**
- Create: `colori/mockup.js`
- Create: `colori/colori.css`

**Interfaces:**
- Consumes: oggetto candidato `{ key, label, hex }` da `colors.js`.
- Produces: `export function renderMockupHTML(candidate)` → stringa HTML della card (sfondo crema, header nell'accent con logo iN bianco, un bottone nell'accent, righe UI fittizie, etichetta `label` sotto). La card NON include il bottone di voto (lo aggiunge `colori.js`).

- [ ] **Step 1: Scrivere `mockup.js`**

```js
// colori/mockup.js
// Logo iN inline (stesso tracciato del brand), fill ereditato da currentColor.
const LOGO_PATH = `<svg viewBox="0 0 808.79 1055.5" width="34" height="44" fill="currentColor" aria-hidden="true"><path d="M729.24,924.6c-17.66,14.1-40.1,16.23-59.94,5.8-18.05-9.49-31.11-25.42-40.85-43.31l-15.59-34.3c-17.01-46.9-31.83-93.69-45.34-141.85l-16.48-58.75c-6.9-24.62-17.79-57.66-39.83-69.57-20.04-10.83-46.62-2.02-59.95,16.15-9.09,12.38-15.22,25.99-20.92,40.27l-21.45,53.76-63.75,160.41-16.82,40.54c-11.89,28.66-24.32,56.17-39.05,83.44-17.01,31.48-41.37,65.27-76.49,75.52-11.73,3.42-25.29,3.83-37.04.42-30.53-8.87-47.17-44.14-54.87-74.05l-12.78-49.66c-1.4-5.45-4.26-12.19-9.17-14.72-6.83-3.52-13.86.44-18.77,5.22-17.3,16.85-40.18,41.94-63.19,33.03-8.97-3.47-17.34-12.79-16.96-22.6l1.51-39.12,3.66-51.32,3.94-43.19,4.03-39.24,4.1-39.26,4.13-35.18c11.82-100.68,27.99-200.17,50.15-299.23,11.5-51.41,23.89-101.6,39.65-151.66l13.02-36.9c3.98-11.28,12.55-21.46,23.55-26.13,29.57-12.54,69.66-.65,78.98,29.71,3.97,12.93.57,25.78-2.26,38.67l-3.98,18.15c-22.75,103.82-30.15,190.03-30.21,296.68-.02,35.91,1.31,70.01,3.73,105.74,1.85,27.35,3.91,53.58,9.63,80.12,3.02,14.02,8.94,32.28,20.8,33.43,0,0,4.11.87,8.85-.93,29.65-11.25,97.96-342.71,240.32-399.37,9.97-3.97,50.69-18.68,85.02-.77,27.22,14.2,41.08,44.04,55.91,111.06,33.09,149.46,19.91,252.71,68.94,286.47,4.37,3.01,14.55,9.62,26.04,7.66,31.42-5.37,42.2-69.06,43.4-76.6,4.25-26.98,8.49-53.96,12.74-80.94,5.41-14.23,30.9-14.3,38.88-3.65,5.83,7.79,4.44,15.42,2.81,23.87l-22,114.5-12.22,61.57c-7.67,38.65-10.34,83.29-43.92,110.09Z"/><path d="M224.71,8.04c21.76,12.51,31.31,39.23,24.85,62.79s-27.28,40.74-52.34,41.2c-29.14.53-52.95-18.88-57.54-46.37-4.7-28.12,12.04-54.64,39.49-62.98,15.59-4.73,30.41-3.33,45.54,5.37Z"/></svg>`;

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

export function renderMockupHTML(candidate) {
  const hex = escapeHtml(candidate.hex);
  const label = escapeHtml(candidate.label);
  return `
    <div class="mk" style="--accent:${hex}">
      <div class="mk-screen">
        <div class="mk-header"><span class="mk-logo">${LOGO_PATH}</span><span class="mk-title">InComune</span></div>
        <div class="mk-body">
          <div class="mk-row"></div>
          <div class="mk-row short"></div>
          <button class="mk-cta" type="button" tabindex="-1">Apri</button>
          <div class="mk-row"></div>
        </div>
      </div>
      <div class="mk-label">${label}</div>
    </div>`;
}
```

- [ ] **Step 2: Scrivere `colori.css` (mockup + layout base)**

```css
/* colori/colori.css — usa i token di ../styles.css dove disponibili */
.torneo-wrap { max-width: 880px; margin: 0 auto; padding: 24px 16px 64px; }
.versus { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; }
.versus .vs { font-weight: 800; opacity: .6; }
@media (max-width: 560px) {
  .versus { grid-template-columns: 1fr; }
  .versus .vs { justify-self: center; }
}
.choice { cursor: pointer; border: 0; background: none; padding: 0; width: 100%; transition: transform .12s ease; }
.choice:hover { transform: translateY(-2px); }
.choice:active { transform: scale(.98); }

.mk { background: #fff; border-radius: 18px; box-shadow: 0 8px 24px rgba(0,0,0,.10); overflow: hidden; }
.mk-screen { background: #FEF9F4; }
.mk-header { background: var(--accent); color: #fff; display: flex; align-items: center; gap: 8px; padding: 14px 16px; }
.mk-logo { display: inline-flex; }
.mk-title { font-weight: 800; font-size: 18px; }
.mk-body { padding: 16px; display: flex; flex-direction: column; gap: 10px; min-height: 150px; }
.mk-row { height: 14px; border-radius: 7px; background: #ECE3D8; }
.mk-row.short { width: 60%; }
.mk-cta { align-self: flex-start; background: var(--accent); color: #fff; border: 0; border-radius: 10px; padding: 8px 18px; font-weight: 700; }
.mk-label { text-align: center; font-weight: 700; padding: 10px; color: #5b5249; }

.progress { text-align: center; margin: 8px 0 20px; color: #5b5249; font-weight: 600; }
```

- [ ] **Step 3: Verifica manuale del rendering**

Creare temporaneamente nessun file: aprire `colori/index.html` solo dopo Task 5. Per ora verificare la sintassi JS: `node -e "import('./colori/mockup.js').then(m=>{const h=m.renderMockupHTML({key:'x',label:'Test',hex:'#E0592B'}); if(!h.includes('#E0592B')||!h.includes('Test'))throw new Error('render KO'); console.log('render OK');})"`
Expected: stampa `render OK`.

- [ ] **Step 4: Commit**

```bash
git add colori/mockup.js colori/colori.css
git commit -m "feat(colori): mini-mockup card + stili torneo"
```

---

## Task 5: Pagina torneo (flusso + Supabase)

**Files:**
- Create: `colori/index.html`
- Create: `colori/colori.js`

**Interfaces:**
- Consumes: `CANDIDATES` (colors.js), `createTournament/currentPair/pick` (bracket.js), `renderMockupHTML` (mockup.js).
- Produces: pagina giocabile; ogni `pick` fa `INSERT` su `votes` con `{ session_id, nickname, round, candidate_a, candidate_b, winner }`.

- [ ] **Step 1: Scrivere `index.html`**

Sostituire `__SUPABASE_URL__` e `__SUPABASE_ANON_KEY__` con i valori del progetto creato in Task 1.

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Scegli il colore di InComune</title>
  <meta name="robots" content="noindex">
  <link rel="icon" href="../assets/favicon.svg">
  <link rel="stylesheet" href="../styles.css">
  <link rel="stylesheet" href="colori.css">
</head>
<body>
  <main class="torneo-wrap">
    <section id="intro">
      <h1>Aiutaci a scegliere il colore di InComune</h1>
      <p>Sfida i colori a coppie e scegli il tuo preferito, fino al campione. Bastano due minuti. Grazie dal team di InComune.</p>
      <label for="nick">Come ti chiami? (facoltativo)</label>
      <input id="nick" type="text" maxlength="40" autocomplete="off" placeholder="Il tuo nome">
      <button id="start" type="button" class="cta">Inizia</button>
    </section>

    <section id="game" hidden>
      <div class="progress" id="progress"></div>
      <div class="versus">
        <button class="choice" id="choiceA" type="button"></button>
        <span class="vs">VS</span>
        <button class="choice" id="choiceB" type="button"></button>
      </div>
    </section>

    <section id="final" hidden>
      <h2>Il tuo colore e</h2>
      <div id="winner"></div>
      <button id="again" type="button" class="cta">Gioca di nuovo</button>
    </section>
  </main>

  <script type="module" src="colori.js"></script>
</body>
</html>
```

- [ ] **Step 2: Scrivere `colori.js`**

```js
// colori/colori.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CANDIDATES } from './colors.js';
import { createTournament, currentPair, pick } from './bracket.js';
import { renderMockupHTML } from './mockup.js';

const SUPABASE_URL = '__SUPABASE_URL__';
const SUPABASE_ANON_KEY = '__SUPABASE_ANON_KEY__';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const byKey = Object.fromEntries(CANDIDATES.map(c => [c.key, c]));
const el = id => document.getElementById(id);

let state = null;
let sessionId = null;
let nickname = null;

function renderPair() {
  const pair = currentPair(state);
  if (!pair) return renderFinal();
  const [a, b] = pair;
  el('choiceA').innerHTML = renderMockupHTML(byKey[a]);
  el('choiceB').innerHTML = renderMockupHTML(byKey[b]);
  el('progress').textContent = `Round ${state.round} di ${state.totalRounds}`;
}

async function choose(winnerKey) {
  const { state: next, matchup } = pick(state, winnerKey);
  state = next;
  // fire-and-forget: l'INSERT non deve bloccare l'esperienza
  supabase.from('votes').insert({
    session_id: sessionId,
    nickname: nickname || null,
    round: matchup.round,
    candidate_a: matchup.candidate_a,
    candidate_b: matchup.candidate_b,
    winner: matchup.winner,
  }).then(({ error }) => { if (error) console.error('insert vote', error); });

  if (state.champion) renderFinal(); else renderPair();
}

function renderFinal() {
  el('game').hidden = true;
  el('final').hidden = false;
  el('winner').innerHTML = renderMockupHTML(byKey[state.champion]);
}

function startGame() {
  nickname = el('nick').value.trim().slice(0, 40);
  sessionId = crypto.randomUUID();
  state = createTournament(CANDIDATES.map(c => c.key));
  el('intro').hidden = true;
  el('final').hidden = true;
  el('game').hidden = false;
  renderPair();
}

el('start').addEventListener('click', startGame);
el('again').addEventListener('click', () => { el('final').hidden = true; el('intro').hidden = false; });
el('choiceA').addEventListener('click', () => choose(currentPair(state)[0]));
el('choiceB').addEventListener('click', () => choose(currentPair(state)[1]));
```

- [ ] **Step 3: Iniettare le credenziali Supabase**

Sostituire in `colori/colori.js` `__SUPABASE_URL__` e `__SUPABASE_ANON_KEY__` con i valori reali del progetto creato in Task 1.

- [ ] **Step 4: Verifica manuale in locale**

Servire la cartella: `cd "/c/Pjt. InComune/incomune-site" && python -m http.server 8080` (o `npx serve`). Aprire `http://localhost:8080/colori/`.
Expected: intro → "Inizia" → 15 sfide a coppie con i due mockup → schermata finale col campione. Controllare la console: nessun errore di INSERT.

- [ ] **Step 5: Verificare la scrittura su Supabase**

Via MCP `execute_sql`: `select count(*) from votes; select * from color_leaderboard() limit 5;`
Expected: count > 0 dopo una partita di prova; la leaderboard mostra win_rate plausibili. Poi opzionale cleanup dei voti di test per `session_id`.

- [ ] **Step 6: Commit**

```bash
git add colori/index.html colori/colori.js
git commit -m "feat(colori): pagina torneo giocabile con persistenza Supabase"
```

---

## Task 6: Pagina risultati (classifica, non linkata)

**Files:**
- Create: `colori/risultati/index.html`
- Create: `colori/risultati/risultati.js`

**Interfaces:**
- Consumes: `CANDIDATES` (per label/hex), RPC `color_leaderboard`.
- Produces: tabella classifica ordinata per win-rate.

- [ ] **Step 1: Scrivere `risultati/index.html`**

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Risultati torneo colori</title>
  <meta name="robots" content="noindex">
  <link rel="stylesheet" href="../../styles.css">
  <link rel="stylesheet" href="../colori.css">
</head>
<body>
  <main class="torneo-wrap">
    <h1>Classifica colori</h1>
    <p id="status">Carico...</p>
    <table id="board" hidden>
      <thead><tr><th></th><th>Colore</th><th>Win-rate</th><th>Vittorie</th><th>Sfide</th><th>Campione</th></tr></thead>
      <tbody></tbody>
    </table>
  </main>
  <script type="module" src="risultati.js"></script>
</body>
</html>
```

- [ ] **Step 2: Scrivere `risultati.js`**

Stesse credenziali Supabase del Task 5.

```js
// colori/risultati/risultati.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CANDIDATES } from '../colors.js';

const SUPABASE_URL = '__SUPABASE_URL__';
const SUPABASE_ANON_KEY = '__SUPABASE_ANON_KEY__';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const byKey = Object.fromEntries(CANDIDATES.map(c => [c.key, c]));

async function load() {
  const { data, error } = await supabase.rpc('color_leaderboard');
  const status = document.getElementById('status');
  if (error) { status.textContent = 'Errore nel caricamento.'; console.error(error); return; }
  if (!data || !data.length) { status.textContent = 'Ancora nessun voto.'; return; }
  const tbody = document.querySelector('#board tbody');
  tbody.innerHTML = data.map((r, i) => {
    const c = byKey[r.color_key] || { label: r.color_key, hex: '#ccc' };
    const pct = r.win_rate == null ? '-' : Math.round(r.win_rate * 100) + '%';
    return `<tr>
      <td><span style="display:inline-block;width:16px;height:16px;border-radius:4px;background:${c.hex}"></span></td>
      <td>${c.label}</td><td>${pct}</td><td>${r.wins}</td><td>${r.appearances}</td><td>${r.champion_count}</td>
    </tr>`;
  }).join('');
  status.hidden = true;
  document.getElementById('board').hidden = false;
}
load();
```

- [ ] **Step 3: Iniettare credenziali e verificare**

Sostituire i due placeholder. Aprire `http://localhost:8080/colori/risultati/`.
Expected: tabella ordinata per win-rate coi colori candidati; se nessun voto, messaggio "Ancora nessun voto.".

- [ ] **Step 4: Commit**

```bash
git add colori/risultati/index.html colori/risultati/risultati.js
git commit -m "feat(colori): pagina risultati classifica via RPC"
```

---

## Task 7: Rifinitura impeccable + responsive + deploy

**Files:**
- Modify: `colori/colors.js` (eventuale ritocco hex)
- Modify: `colori/colori.css` (rifinitura)
- Modify: `colori/index.html`, `colori/risultati/index.html` (copy/meta)

**Interfaces:**
- Consumes: tutto quanto sopra.

- [ ] **Step 1: Passata impeccable**

Invocare la skill `impeccable` su `colori/index.html` + `colori.css` + i mockup: verificare gerarchia visiva, leggibilità del logo bianco su OGNI hex (specie giallo `yellow-caldo`/`yellow-ocra`), spaziatura, stati hover/active/focus, coerenza coi token del sito. Applicare i ritocchi (inclusi eventuali aggiustamenti hex in `colors.js`).

- [ ] **Step 2: Verifica responsive**

Aprire la pagina a 360px e a 1280px. Expected: a ≤560px le due card si impilano con "VS" centrato; nessun overflow orizzontale; tap target ≥44px.

- [ ] **Step 3: Verifica accessibilità rapida**

Navigazione da tastiera (Tab → choiceA/choiceB/start/again raggiungibili e attivabili con Invio), `:focus` visibile, contrasto del testo "VS"/label adeguato.

- [ ] **Step 4: Commit**

```bash
git add colori/
git commit -m "polish(colori): rifinitura impeccable, responsive e a11y"
```

- [ ] **Step 5: Deploy (solo su richiesta esplicita dell'utente)**

Il sito è GitHub Pages su `main`. NON pushare senza richiesta esplicita (guardrail repo). Quando autorizzato:

```bash
git push origin main
```
Verificare poi `https://incomune.app/colori/` live e fare una partita di prova; controllare `https://incomune.app/colori/risultati/`.

---

## Self-Review (autore)

- **Spec coverage:** persistenza ogni 1v1 → Task 1/5; mini-mockup realistico → Task 4; bracket 16→4 round → Task 3; nickname facoltativo + link aperto → Task 5; nuovo progetto Supabase isolato → Task 1; classifica nascosta durante il voto + pagina risultati separata non linkata → Task 5 (niente leaderboard nel flusso) + Task 6 (`noindex`). 16 candidati 6 famiglie → Task 2. Tutto coperto.
- **Placeholder scan:** gli unici placeholder sono le credenziali Supabase (`__SUPABASE_URL__`/`__SUPABASE_ANON_KEY__`), risolte esplicitamente in step dedicati (Task 5 Step 3, Task 6 Step 3) dopo la creazione del progetto in Task 1. Nessun TODO logico.
- **Type consistency:** `state`/`currentPair`/`pick`/`matchup` coerenti tra Task 3 e Task 5; colonne `votes` coerenti tra Task 1 (DDL), Task 5 (insert) e RPC; `color_leaderboard` ritorna `color_key/appearances/wins/win_rate/champion_count`, usate identiche in Task 6. `CANDIDATES` shape `{key,label,family,hex}` coerente in Task 2/4/5/6.
