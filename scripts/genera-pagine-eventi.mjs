#!/usr/bin/env node
// Genera le pagine statiche incomune.app/eventi/<id> con meta Open Graph propri,
// cosi' le anteprime dei link condivisi dall'app mostrano titolo e locandina.
//
// Uso:
//   node scripts/genera-pagine-eventi.mjs --out _site
//   node scripts/genera-pagine-eventi.mjs --from-json eventi.json --out <dir>
//        [--now 2026-10-20T20:00:00Z] [--poster-sizes pesi.json]
//
// Da Supabase (default) servono: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
// SHARE_BOT_EMAIL, SHARE_BOT_PASSWORD (account bot con ruolo `user`).
// ALLOW_EMPTY=1 accetta 0 eventi (altrimenti exit 1 e il deploy non parte).
//
// Con --from-json non si fa nessuna chiamata di rete: peso e formato delle
// locandine arrivano da --poster-sizes ({"<url>": {"bytes": n, "type": "image/jpeg"}});
// senza, ogni locandina e' "ignota" e la pagina usa il logo. Con --now anche
// _build.json usa quell'istante.
//
// Le pagine si scrivono in <out>/.eventi-in-corso e solo alla fine diventano
// <out>/eventi: un errore a meta' non lascia pagine parziali.
//
// Node 20+, nessuna dipendenza: solo fetch e moduli built-in.

import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  assertRows,
  buildPages,
  posterCandidates,
  posterHeadOk,
  selectEvents,
} from './pagine-eventi-core.mjs';

// Colonne verificate su supabase/schema-current.sql (repo dell'app), 20 ott 2026.
const EVENT_COLUMNS = [
  'id',
  'title',
  'start_datetime',
  'end_datetime',
  'has_program',
  'program_start_at',
  'program_end_at',
  'parent_event_id',
  'location_name',
  'image_url',
  'status',
].join(',');
const PAGE_SIZE = 500;
const MAX_PAGES = 40; // tetto di sicurezza: 20.000 righe
const TIMEOUT_MS = 20_000;
const HEAD_TIMEOUT_MS = 8_000;
const HEAD_CONCURRENCY = 4;

function fail(message) {
  throw new Error(message);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) fail(`variabile d'ambiente mancante: ${name}`);
  return value;
}

async function readBody(res) {
  const text = await res.text();
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: undefined, text };
  }
}

function short(text) {
  return String(text ?? '').replace(/\s+/g, ' ').slice(0, 300);
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function login(baseUrl, apikey, email, password) {
  const res = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const { json, text } = await readBody(res);
  if (!res.ok || typeof json?.access_token !== 'string') {
    // Mai stampare token o credenziali: solo stato e messaggio d'errore di GoTrue.
    fail(`login bot fallito (HTTP ${res.status}): ${short(json?.error_description ?? json?.msg ?? text)}`);
  }
  return json.access_token;
}

// Senza `scope`: vale il default di GoTrue (global), che chiude TUTTE le
// sessioni del bot. Cosi' le sessioni lasciate da run interrotti non si
// accumulano; i run sono in serie, quindi non si chiude la sessione di un altro
// run in corso.
async function logout(baseUrl, apikey, token) {
  const res = await fetch(`${baseUrl}/auth/v1/logout`, {
    method: 'POST',
    headers: { apikey, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok && res.status !== 204) {
    const { text } = await readBody(res);
    fail(`logout fallito (HTTP ${res.status}): ${short(text)}`);
  }
}

// Solo eventi radice (parent_event_id is null), pagine fino alla prima vuota:
// non ci si ferma a una pagina corta, cosi' un tetto di righe lato server
// (max rows di PostgREST) piu' basso di PAGE_SIZE non tronca la lista.
// La finestra dei 30 giorni resta lato client: un filtro lato server farebbe
// tornare 0 righe in un periodo senza eventi e la guardia anti-svuotamento
// fermerebbe il cron.
async function fetchEvents(baseUrl, apikey, token) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      select: EVENT_COLUMNS,
      status: 'eq.approved',
      parent_event_id: 'is.null',
      order: 'start_datetime.desc,id.asc',
      limit: String(PAGE_SIZE),
      offset: String(rows.length),
    });
    const res = await fetch(`${baseUrl}/rest/v1/events?${params}`, {
      headers: { apikey, Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const { json, text } = await readBody(res);
    if (!res.ok) fail(`lettura eventi fallita (HTTP ${res.status}): ${short(json?.message ?? text)}`);
    assertRows(json, { allowEmpty: true }); // non-array = errore anche a pagina > 0
    if (json.length === 0) return rows;
    rows.push(...json);
  }
  fail(`piu' di ${MAX_PAGES} pagine di eventi: alzare MAX_PAGES`);
}

async function rowsFromSupabase() {
  const rawUrl = requireEnv('SUPABASE_URL');
  const apikey = requireEnv('SUPABASE_PUBLISHABLE_KEY');
  const email = requireEnv('SHARE_BOT_EMAIL');
  const password = requireEnv('SHARE_BOT_PASSWORD');
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:') fail('SUPABASE_URL deve essere https');
  const baseUrl = url.origin;

  const token = await login(baseUrl, apikey, email, password);
  try {
    return await fetchEvents(baseUrl, apikey, token);
  } finally {
    // Sempre, anche dopo un errore: altrimenti ogni run lascia una sessione viva.
    try {
      await logout(baseUrl, apikey, token);
    } catch (err) {
      // Non blocca il deploy (le pagine sono buone) ma resta visibile nel run:
      // `::warning::` diventa un'annotazione in GitHub Actions.
      console.log(`::warning::sessione del bot non chiusa: ${err.message}`);
    }
  }
}

/** HEAD sulla locandina: qualunque errore diventa "ignota" (logo). */
async function headPoster(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(HEAD_TIMEOUT_MS) });
    return {
      ok: res.ok,
      status: res.status,
      contentLength: res.headers.get('content-length'),
      contentType: res.headers.get('content-type'),
    };
  } catch {
    return null;
  }
}

/** Pesa le locandine con al massimo HEAD_CONCURRENCY richieste insieme. */
async function checkPosters(urls) {
  const result = new Map();
  let next = 0;
  async function worker() {
    while (next < urls.length) {
      const url = urls[next++];
      result.set(url, posterHeadOk(await headPoster(url)));
    }
  }
  await Promise.all(Array.from({ length: Math.min(HEAD_CONCURRENCY, urls.length) }, worker));
  return result;
}

async function postersFromFile(file, urls) {
  const sizes = JSON.parse(await readFile(file, 'utf8'));
  const result = new Map();
  for (const url of urls) {
    const entry = sizes?.[url];
    const head = Number.isInteger(entry?.bytes)
      ? { ok: true, status: 200, contentLength: String(entry.bytes), contentType: entry.type ?? null }
      : null;
    result.set(url, posterHeadOk(head));
  }
  return result;
}

async function main() {
  const { values } = parseArgs({
    options: {
      'from-json': { type: 'string' },
      'poster-sizes': { type: 'string' },
      out: { type: 'string', default: '_site' },
      now: { type: 'string' },
    },
    strict: true,
  });

  const nowMs = values.now ? Date.parse(values.now) : Date.now();
  if (!Number.isFinite(nowMs)) fail(`--now non valido: ${values.now}`);
  const allowEmpty = process.env.ALLOW_EMPTY === '1';
  const offline = Boolean(values['from-json']);

  const outDir = path.resolve(values.out);
  const eventsDir = path.join(outDir, 'eventi');
  const workDir = path.join(outDir, '.eventi-in-corso');
  // Mai sovrascrivere o mescolare: una cartella eventi/ gia' presente in <out>
  // (dal repo o da un run precedente) e' un errore, non qualcosa da cancellare.
  if (await exists(eventsDir)) fail(`${eventsDir} esiste gia'`);

  const rows = offline
    ? JSON.parse(await readFile(values['from-json'], 'utf8'))
    : await rowsFromSupabase();

  assertRows(rows, { allowEmpty });
  const { events, skipped } = selectEvents(rows, nowMs);

  const urls = posterCandidates(events, nowMs);
  let posterOk;
  if (values['poster-sizes']) posterOk = await postersFromFile(values['poster-sizes'], urls);
  else if (offline) posterOk = new Map(); // nessuna rete: peso ignoto = logo
  else posterOk = await checkPosters(urls);
  const postersUsed = [...posterOk.values()].filter(Boolean).length;

  const pages = buildPages(events, nowMs, posterOk);

  await rm(workDir, { recursive: true, force: true });
  try {
    await mkdir(workDir, { recursive: true });
    for (const page of pages) {
      const target = path.join(workDir, path.basename(page.file));
      // Doppia guardia oltre all'UUID: il file deve stare nella cartella di lavoro.
      if (path.dirname(target) !== workDir || `eventi/${path.basename(page.file)}` !== page.file) {
        fail(`percorso non ammesso: ${page.file}`);
      }
      await writeFile(target, page.html, 'utf8');
    }
    // Freschezza del giro (incomune.app/eventi/_build.json): nessun dato degli eventi.
    const build = { generatedAt: new Date(nowMs).toISOString(), pages: pages.length };
    await writeFile(path.join(workDir, '_build.json'), `${JSON.stringify(build)}\n`, 'utf8');
    await rename(workDir, eventsDir);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }

  console.log(
    `pagine evento: ${pages.length} scritte in ${eventsDir} ` +
      `(righe ${rows.length}; locandine ${postersUsed}/${urls.length} candidate; ` +
      `scartate: ${JSON.stringify(skipped)})`,
  );
}

main().catch((err) => {
  console.error(`ERRORE: ${err.message}`);
  process.exitCode = 1;
});
