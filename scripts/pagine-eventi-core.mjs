// Funzioni pure del generatore delle pagine evento (incomune.app/eventi/<id>).
// Nessun I/O qui: rete e filesystem stanno in genera-pagine-eventi.mjs, cosi'
// tutto cio' che decide il contenuto delle pagine si prova con `node --test`.

export const SITE_ORIGIN = 'https://incomune.app';
export const FALLBACK_IMAGE = `${SITE_ORIGIN}/assets/og-image.png`;
export const FALLBACK_IMAGE_SIZE = { width: 1200, height: 630 };
export const IMAGE_HOST = 'dijicgloszsmomgyxjlf.supabase.co';
export const IMAGE_PATH_PREFIX = '/storage/v1/object/public/event-images/';
export const TIME_ZONE = 'Europe/Rome';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
export const WINDOW_DAYS = 30;
export const POSTER_GRACE_HOURS = 24;
// Locandine degli organizzatori nelle anteprime solo dall'entrata in vigore dei
// Termini versione «2026-11-17»: 17 novembre 2026 00:00 ora italiana (CET).
// Prima di questa data tutte le pagine usano il logo. Se la data dei Termini
// slitta, si cambia solo qui (e il test del confine).
export const POSTER_DAL = Date.parse('2026-11-16T23:00:00Z');
// WhatsApp: «This image should be under 600KB in size»
// (https://developers.facebook.com/docs/whatsapp/link-previews/). 600.000 byte:
// la lettura prudente di «600KB» (KB decimali), sotto anche a 600 KiB.
export const POSTER_MAX_BYTES = 600_000;
// Formati della locandina accettati per l'anteprima (Content-Type della HEAD).
export const POSTER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// Una serata che finisce entro le 6 del mattino dopo conta ancora come un
// giorno solo (concerto 21:00 - 01:30): niente «da sabato a domenica».
const NIGHT_CUTOFF_HOURS = 6;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** UUID in forma canonica minuscola (come lo restituisce Postgres). */
export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Escaping per testo e per valori di attributo tra doppi apici. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Testo libero del DB su una riga: caratteri di controllo e separatori di riga
 * diventano spazi, i controlli bidirezionali (che ribalterebbero l'anteprima)
 * spariscono, gli spazi si compattano. Intervalli per code point, cosi' nel
 * sorgente non c'e' nessun carattere invisibile.
 */
const STRIP_RANGES = [
  [0x0000, 0x001f, ' '], // C0
  [0x007f, 0x007f, ' '], // DEL
  [0x2028, 0x2029, ' '], // separatori di riga e paragrafo
  [0x200e, 0x200f, ''], // LRM, RLM
  [0x202a, 0x202e, ''], // LRE, RLE, PDF, LRO, RLO
  [0x2066, 0x2069, ''], // LRI, RLI, FSI, PDI
];
export function cleanText(value) {
  if (typeof value !== 'string') return '';
  let out = '';
  for (const ch of value) {
    const cp = ch.codePointAt(0);
    const hit = STRIP_RANGES.find(([from, to]) => cp >= from && cp <= to);
    out += hit ? hit[2] : ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}

function toMs(value) {
  if (typeof value !== 'string' || value === '') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

const romeNumeric = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function romeWallClock(ms) {
  const p = {};
  for (const { type, value } of romeNumeric.formatToParts(new Date(ms))) p[type] = Number(value);
  return p;
}

/** Scarto (ms) tra l'ora di Novoli e UTC all'istante dato: +1 h (CET) o +2 h (CEST). */
function romeOffsetMs(ms) {
  const p = romeWallClock(ms);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUtc - Math.floor(ms / 1000) * 1000;
}

/** 23:59:59.999 ora di Novoli del giorno (a Novoli) in cui cade `ms`. */
export function romeEndOfDayMs(ms) {
  const p = romeWallClock(ms);
  const wallEnd = Date.UTC(p.year, p.month - 1, p.day, 23, 59, 59, 999);
  // Due passate: la seconda corregge se il cambio d'ora cade nella giornata.
  const guess = wallEnd - romeOffsetMs(wallEnd);
  return wallEnd - romeOffsetMs(guess);
}

/**
 * Inizio e fine dell'evento, come li calcola l'app per la locandina
 * (app/eventi/[id].tsx ~485, lib/event-program.ts `programEnvelope`,
 * lib/event-timeline.ts `effectiveEndMs`):
 * - con programma (`has_program`): inizio = min(start_datetime, program_start_at),
 *   fine = max(fine effettiva del padre, program_end_at), dove la fine effettiva
 *   e' end_datetime o, se manca, le 23:59 del giorno d'inizio (ora di Novoli);
 * - senza programma: inizio = start_datetime, fine = end_datetime ?? start_datetime.
 * Unica fonte per locandina, finestra dei 30 giorni e data mostrata.
 * Restituisce null se le date non si leggono.
 */
export function eventSpan(ev) {
  const start = toMs(ev.start_datetime);
  if (start === null) return null;
  if (ev.has_program === true) {
    const ps = toMs(ev.program_start_at);
    const pe = toMs(ev.program_end_at);
    const parentEnd = toMs(ev.end_datetime) ?? romeEndOfDayMs(start);
    return {
      startMs: ps !== null && ps < start ? ps : start,
      endMs: pe !== null && pe > parentEnd ? pe : parentEnd,
    };
  }
  const end = toMs(ev.end_datetime ?? ev.start_datetime);
  if (end === null) return null;
  return { startMs: start, endMs: end };
}

/** Pagina generata solo se la fine e' a non piu' di WINDOW_DAYS giorni fa. */
export function isInWindow(ev, nowMs, days = WINDOW_DAYS) {
  const span = eventSpan(ev);
  return span !== null && span.endMs >= nowMs - days * DAY_MS;
}

/**
 * URL della locandina ammessa: solo https, host del progetto Supabase, bucket
 * pubblico event-images. Restituisce l'URL normalizzato o null.
 */
export function allowedImageUrl(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password || url.port) return null;
  if (url.hostname !== IMAGE_HOST) return null;
  // Il parser WHATWG ha gia' risolto `..` e `%2e%2e`: il prefisso si controlla dopo.
  if (!url.pathname.startsWith(IMAGE_PATH_PREFIX)) return null;
  if (url.pathname.length <= IMAGE_PATH_PREFIX.length) return null;
  url.hash = '';
  return url.href;
}

/** Come l'app (app/eventi/[id].tsx ~485): locandina visibile fino a 24 h dopo la fine. */
export function posterVisible(ev, nowMs) {
  if (!ev.image_url) return false;
  const span = eventSpan(ev);
  if (span === null) return false;
  return (nowMs - span.endMs) / HOUR_MS < POSTER_GRACE_HOURS;
}

/**
 * URL della locandina da proporre come og:image, prima del controllo del peso:
 * solo dal POSTER_DAL, solo se visibile come nell'app e se l'URL e' ammesso.
 */
export function posterCandidate(ev, nowMs) {
  if (nowMs < POSTER_DAL) return null;
  if (!posterVisible(ev, nowMs)) return null;
  return allowedImageUrl(ev.image_url);
}

/**
 * Peso dalla HEAD: solo 200 con Content-Length intero, positivo e non oltre
 * POSTER_MAX_BYTES. HEAD fallita, altro stato o lunghezza assente/illeggibile = no.
 * `head`: { ok, status, contentLength, contentType } con stringhe o null.
 */
export function posterSizeOk(head) {
  if (!head || head.ok !== true || head.status !== 200) return false;
  const raw = typeof head.contentLength === 'string' ? head.contentLength.trim() : '';
  if (!/^\d+$/.test(raw)) return false;
  const bytes = Number(raw);
  return bytes > 0 && bytes <= POSTER_MAX_BYTES;
}

/** Formato dalla HEAD: jpeg, png o webp (maiuscole e parametri dopo `;` ignorati). */
export function posterTypeOk(head) {
  if (!head || typeof head.contentType !== 'string') return false;
  const mime = head.contentType.split(';')[0].trim().toLowerCase();
  return POSTER_TYPES.includes(mime);
}

/** Locandina usabile per l'anteprima: peso e formato entrambi ok, altrimenti logo. */
export function posterHeadOk(head) {
  return posterSizeOk(head) && posterTypeOk(head);
}

/**
 * Immagine OG: locandina se candidata e con peso verificato (`posterOk`, mappa
 * URL -> boolean dal controllo HEAD), altrimenti il logo.
 */
export function ogImage(ev, nowMs, posterOk = new Map()) {
  const url = posterCandidate(ev, nowMs);
  if (url && posterOk.get(url) === true) return { url, isPoster: true };
  return { url: FALLBACK_IMAGE, isPoster: false, ...FALLBACK_IMAGE_SIZE };
}

const romeParts = new Intl.DateTimeFormat('it-IT', {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Componenti di data e ora a Novoli (Europe/Rome). */
export function romeDate(ms) {
  const p = {};
  for (const { type, value } of romeParts.formatToParts(new Date(ms))) p[type] = value;
  return {
    weekday: p.weekday,
    day: Number(p.day),
    month: p.month,
    year: Number(p.year),
    time: `${p.hour}:${p.minute}`,
    key: `${p.year}-${p.month}-${p.day}`,
  };
}

function dayLabel(d, { withMonth = true, withYear = false } = {}) {
  let s = `${d.weekday} ${d.day}`;
  if (withMonth) s += ` ${d.month}`;
  if (withYear) s += ` ${d.year}`;
  return s;
}

/**
 * Data in italiano, fuso di Novoli.
 * - un giorno:     «mercoledì 21 ottobre, ore 19:30»
 * - piu' giorni:   «da sabato 24 a lunedì 26 ottobre»,
 *                  «da venerdì 30 ottobre a domenica 1 novembre»
 * L'anno compare solo se non e' quello in corso. «da <giorno>» evita gli
 * articoli con elisione («dall'8»).
 */
export function formatWhen(ev, nowMs) {
  const span = eventSpan(ev);
  if (span === null) return '';
  const { startMs, endMs } = span;
  const start = romeDate(startMs);
  const currentYear = romeDate(nowMs).year;

  if (endMs > startMs) {
    const lastDay = romeDate(endMs - NIGHT_CUTOFF_HOURS * HOUR_MS);
    if (endMs - NIGHT_CUTOFF_HOURS * HOUR_MS > startMs && lastDay.key !== start.key) {
      const sameYear = lastDay.year === start.year;
      const showYear = !sameYear || lastDay.year !== currentYear;
      const sameMonth = sameYear && lastDay.month === start.month;
      const from = dayLabel(start, { withMonth: !sameMonth, withYear: !sameYear });
      const to = dayLabel(lastDay, { withYear: showYear });
      return `da ${from} a ${to}`;
    }
  }
  const day = dayLabel(start, { withYear: start.year !== currentYear });
  return `${day}, ore ${start.time}`;
}

function capitalize(text) {
  return text ? text.charAt(0).toLocaleUpperCase('it-IT') + text.slice(1) : text;
}

/** Riga data + luogo per og:description e per la pagina, con l'iniziale maiuscola. */
export function formatDescription(ev, nowMs) {
  const when = formatWhen(ev, nowMs);
  const where = cleanText(ev.location_name);
  if (when && where) return capitalize(`${when} · ${where}`);
  return capitalize(when || where) || "Un evento a Novoli, nell'app InComune.";
}

export function eventTitle(ev) {
  return cleanText(ev.title) || 'Evento a Novoli';
}

/**
 * Pagina HTML dell'evento: stessa grafica di 404.html, testa con meta OG propri.
 * `posterOk`: mappa URL locandina -> peso verificato (vedi ogImage).
 */
export function renderEventPage(ev, nowMs, posterOk = new Map()) {
  const id = ev.id;
  if (!isUuid(id)) throw new Error('id evento non valido');
  const title = eventTitle(ev);
  const description = formatDescription(ev, nowMs);
  const image = ogImage(ev, nowMs, posterOk);
  const pageUrl = `${SITE_ORIGIN}/eventi/${id}`;
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const img = escapeHtml(image.url);
  const imageSize = image.isPoster
    ? ''
    : `\n<meta property="og:image:width" content="${image.width}">\n<meta property="og:image:height" content="${image.height}">`;

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${t} · InComune</title>
<meta name="description" content="${d}">
<meta name="robots" content="noindex">

<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png">
<meta name="theme-color" content="#F17100">

<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:type" content="website">
<meta property="og:url" content="${escapeHtml(pageUrl)}">
<meta property="og:site_name" content="InComune">
<meta property="og:locale" content="it_IT">
<meta property="og:image" content="${img}">${imageSize}
<meta property="og:image:alt" content="${t}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">
<meta name="twitter:image:alt" content="${t}">

<link rel="stylesheet" href="/styles.css">
<style>
  .container { max-width: 480px; }
  .logo-mark { color: var(--terracotta); height: 56px; }
  .t-title { font-family: var(--font-serif); font-size: clamp(1.6rem, 1.3rem + 1.6vw, 2.2rem); line-height: 1.1; overflow-wrap: anywhere; }
  .event-when { font-weight: 700; color: var(--text); margin: 0 0 14px; }
</style>
</head>
<body>

<div class="centered-screen">
  <div class="container">
    <img class="logo-mark" src="/assets/logo-in.svg" alt="InComune" height="56" style="margin: 0 auto 18px;">
    <p class="eyebrow">Apri nell'app</p>
    <h1 class="t-title" style="margin:6px 0 10px;">${t}</h1>
    <p class="event-when">${d}</p>
    <p class="lead" style="margin-bottom: 24px;">Dettagli e aggiornamenti dell'evento sono nell'app. Scarica InComune e ritrova tutto ciò che riguarda Novoli direttamente in tasca.</p>

    <div class="store-row" style="justify-content: center;">
      <a class="store-btn" href="https://apps.apple.com/app/id6761307454" target="_blank" rel="noopener" aria-label="Scarica InComune su App Store">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
        <span class="store-label"><span class="store-small">Scarica su</span><span class="store-name">App Store</span></span>
      </a>
      <a class="store-btn" href="https://play.google.com/store/apps/details?id=app.incomune" target="_blank" rel="noopener" aria-label="Scarica InComune su Google Play">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20.5v-17c0-.59.34-1.11.84-1.35L13.69 12l-9.85 9.85c-.5-.24-.84-.76-.84-1.35zm13.81-5.38L6.05 21.34l8.49-8.49 2.27 2.27zm.91-.91L19.59 12l-1.87-2.21-2.27 2.27 2.27 2.15zM6.05 2.66l10.76 6.22-2.27 2.27-8.49-8.49z"/></svg>
        <span class="store-label"><span class="store-small">Scarica su</span><span class="store-name">Google Play</span></span>
      </a>
    </div>

    <p class="muted" style="margin-top: 28px; font-size: var(--fs-small);">
      <a href="/">incomune.app</a> · <a href="/privacy-policy">Privacy</a> · <a href="/termini">Termini</a>
    </p>
  </div>
</div>

</body>
</html>
`;
}

/**
 * Guardia anti-svuotamento sulla risposta di Supabase: non-array = errore
 * sempre; 0 righe = errore salvo allowEmpty (ALLOW_EMPTY=1).
 */
export function assertRows(rows, { allowEmpty = false } = {}) {
  if (!Array.isArray(rows)) {
    throw new Error('risposta eventi non valida (non è un array)');
  }
  if (rows.length === 0 && !allowEmpty) {
    throw new Error('0 eventi restituiti: deploy fermato (ALLOW_EMPTY=1 per forzare)');
  }
}

/**
 * Righe che diventano pagine. Scarta id non UUID, eventi non approvati, figli di
 * un programma (`parent_event_id` valorizzato: la query li esclude gia'), date
 * illeggibili, eventi fuori finestra e duplicati.
 */
export function selectEvents(rows, nowMs) {
  const events = [];
  const skipped = { invalidId: 0, notApproved: 0, child: 0, invalidDate: 0, outOfWindow: 0, duplicate: 0 };
  const seen = new Set();
  for (const ev of rows) {
    if (!ev || typeof ev !== 'object' || !isUuid(ev.id)) { skipped.invalidId++; continue; }
    if (ev.status !== 'approved') { skipped.notApproved++; continue; }
    if (ev.parent_event_id != null) { skipped.child++; continue; }
    if (eventSpan(ev) === null) { skipped.invalidDate++; continue; }
    if (!isInWindow(ev, nowMs)) { skipped.outOfWindow++; continue; }
    if (seen.has(ev.id)) { skipped.duplicate++; continue; }
    seen.add(ev.id);
    events.push(ev);
  }
  return { events, skipped };
}

/** URL delle locandine da pesare con una HEAD (senza doppioni). */
export function posterCandidates(events, nowMs) {
  const urls = new Set();
  for (const ev of events) {
    const url = posterCandidate(ev, nowMs);
    if (url) urls.add(url);
  }
  return [...urls];
}

/** Dagli eventi selezionati alle pagine da scrivere. */
export function buildPages(events, nowMs, posterOk = new Map()) {
  return events.map((ev) => ({
    id: ev.id,
    file: `eventi/${ev.id}.html`,
    html: renderEventPage(ev, nowMs, posterOk),
  }));
}
