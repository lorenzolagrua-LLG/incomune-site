# Torneo Colori InComune — Design

**Data:** 2026-06-20
**Repo:** `incomune-site` (GitHub Pages, dominio `incomune.app`)
**Stato:** approvato in brainstorming, pronto per il piano di implementazione

## Obiettivo

Decidere il colore d'accento definitivo del brand InComune (blu → terracotta → arancio → ?)
facendo votare gli amici. Una pagina pubblica su `incomune.app/colori` propone un **torneo a
eliminazione diretta 1v1** tra colori-candidati; il logo iN resta sempre lo stesso, cambia solo
la tinta d'accento. Ogni singolo 1v1 viene registrato su un Supabase dedicato per costruire una
classifica globale per **win-rate** aggregando i voti di tutti.

## Decisioni prese (brainstorming)

- **Persistenza:** Supabase, registrando **ogni singolo 1v1** (non solo il vincitore finale).
- **Presentazione:** mini-mockup realistico dell'app (sfondo crema + logo + accenno UI), il
  colore candidato applicato come accent.
- **Formato:** bracket a eliminazione diretta con seeding random; **16 candidati** → 4 round
  (16→8→4→2→1), ~15 scelte 1v1 per partita.
- **Accesso:** link aperto, **nickname facoltativo**, nessun login.
- **DB:** **nuovo progetto Supabase free dedicato**, isolato dalla produzione (guardrail: mai
  superfici di scrittura anonima accanto ai dati reali degli utenti).
- **Classifica:** **nascosta durante il voto** (no effetto gregge); pagina risultati separata e
  non linkata per l'admin.

## Candidati (16 colori, 6 famiglie)

| Famiglia | Shade | Note |
|---|---|---|
| Arancio | 3 | incluso l'attuale `#F17100` |
| Blu | 3 | incluso il blu Novoli originale |
| Verde | 3 | oliva / salvia / bosco |
| Viola | 3 | prugna / lilla / melanzana |
| Rosso | 2 | mattone caldo / corallo |
| Giallo | 2 | ocra-senape / caldo |

Totale = 16. I **valori hex esatti** vengono curati con la skill **impeccable** in fase di
implementazione: tinte leggibili sullo sfondo crema `#FEF9F4` e coerenti con l'identità
calda/handmade del brand. Ogni candidato ha un identificatore stabile (`key`), un'etichetta
leggibile (`label`) e un `hex`.

## Architettura

### Frontend
- Pagina statica in `incomune-site/colori/`: `index.html` + `colori.js` + CSS (riusa
  `styles.css` del sito; CSS specifico inline o in `colori.css`).
- **Vanilla JS**, nessun build step (coerente col resto del sito statico).
- Config dei 16 colori in un oggetto JS (`{ key, label, family, hex }`).
- Client Supabase via `supabase-js` da CDN (anon key pubblica — normale per client statico).

### Backend (nuovo progetto Supabase dedicato)
- Tabella `votes`:
  - `id` (uuid, pk, default gen)
  - `session_id` (uuid) — generato lato client all'inizio di ogni partita
  - `nickname` (text, nullable)
  - `round` (text o int) — quale round del bracket
  - `candidate_a` (text) — key colore
  - `candidate_b` (text) — key colore
  - `winner` (text) — key colore vincente (== a o b)
  - `created_at` (timestamptz, default now())
- **RLS:** policy **solo INSERT** per ruolo `anon`. Nessuna SELECT sulla tabella grezza.
- **RPC `color_leaderboard()`** (SECURITY DEFINER) → per ogni colore: `key`, `appearances`,
  `wins`, `win_rate`, `final_champion_count`. Usata solo dalla pagina risultati.
- Migration versionata in `supabase/migrations/` del nuovo progetto + `schema-current.sql`.

## Flusso utente

1. `/colori` → intro ("Aiutaci a scegliere il colore di InComune") + nickname facoltativo +
   "Inizia". Genera `session_id`, mescola i 16 candidati nel bracket.
2. 15 sfide 1v1: due mini-mockup affiancati (desktop) o impilati (mobile). Tap = vince quel
   colore → INSERT del 1v1 su Supabase → animazione → prossima sfida. Barra "Round x/4".
   Classifica **non** mostrata.
3. Schermata finale: "Il tuo colore è ___" + card vincitrice in grande + "Gioca di nuovo" +
   condividi link.
4. `/colori/risultati` (non linkata): classifica globale via RPC `color_leaderboard`, ordinata
   per win-rate, con apparizioni/vittorie e n° di campioni finali.

## Mini-mockup

Card che imita la home dell'app: sfondo crema `#FEF9F4`, logo iN in alto, header/barra e un
bottone nel colore candidato, 1-2 righe UI fittizie. Responsive: affiancate su desktop, impilate
su mobile. Tap sulla card seleziona il vincitore con feedback animato.

## Fuori scope (YAGNI)

Login/account, anti-spam sofisticato, real-time, integrazione col DB di produzione, voce nel
menu del sito (pagina unlisted). Si accetta la piccola superficie di abuso (sondaggio tra amici).

## Test / verifica

- Verifica manuale del flusso completo su mobile + desktop.
- Smoke test backend: INSERT di prova su `votes` + lettura aggregato via RPC `color_leaderboard`.
- Controllo leggibilità di ogni hex sul mockup (curato con impeccable).
