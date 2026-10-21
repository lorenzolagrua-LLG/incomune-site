// node --test scripts/pagine-eventi-core.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLBACK_IMAGE,
  POSTER_DAL,
  POSTER_MAX_BYTES,
  allowedImageUrl,
  assertRows,
  buildPages,
  cleanText,
  escapeHtml,
  eventSpan,
  formatDescription,
  formatWhen,
  isInWindow,
  isUuid,
  ogImage,
  posterCandidate,
  posterCandidates,
  posterHeadOk,
  posterSizeOk,
  posterTypeOk,
  posterVisible,
  renderEventPage,
  romeEndOfDayMs,
  selectEvents,
} from './pagine-eventi-core.mjs';

const ID = '32d8a633-5218-4e86-aec0-cfe294974bde';
const IMG = `https://dijicgloszsmomgyxjlf.supabase.co/storage/v1/object/public/event-images/${ID}.jpg?v=1792320649441`;
const NOW = Date.parse('2026-10-20T20:00:00Z'); // martedi' 20 ottobre, 22:00 a Novoli
const H = 3_600_000;
const D = 24 * H;
const cp = (...codes) => String.fromCodePoint(...codes);

const ev = (over = {}) => ({
  id: ID,
  title: 'Detto per la prima volta',
  start_datetime: '2026-10-21T17:30:00Z',
  end_datetime: null,
  has_program: false,
  program_start_at: null,
  program_end_at: null,
  parent_event_id: null,
  location_name: 'Palazzo baronale',
  image_url: IMG,
  status: 'approved',
  ...over,
});

// Evento dopo l'entrata in vigore dei Termini, per i test della locandina.
const NOV = ev({ start_datetime: '2026-11-20T18:00:00Z' });
const NOV_NOW = Date.parse('2026-11-19T12:00:00Z');
const OK = (url = IMG) => new Map([[url, true]]);

const metaContent = (html, attr, name) => {
  const m = html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)">`));
  return m ? m[1] : null;
};

// ---- escaping e testo ---------------------------------------------------------

test('escapeHtml copre & < > " \'', () => {
  assert.equal(escapeHtml(`a & b < c > d " e ' f`), 'a &amp; b &lt; c &gt; d &quot; e &#39; f');
  assert.equal(escapeHtml('&amp;'), '&amp;amp;');
  assert.equal(escapeHtml(null), '');
});

test('titolo e luogo ostili non escono dagli attributi ne\' dal testo', () => {
  const bad = ev({
    title: `"><script>alert('x')</script> Pizza & Birra l'evento`,
    location_name: `Piazza "Grande" <b>&</b>`,
  });
  const html = renderEventPage(bad, NOW);
  assert.ok(!html.includes('<script>'), 'nessun <script> dal titolo');
  assert.ok(!html.includes('<b>'), 'nessun tag dal luogo');
  const ogTitle = metaContent(html, 'property', 'og:title');
  assert.equal(
    ogTitle,
    '&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; Pizza &amp; Birra l&#39;evento',
  );
  assert.ok(html.includes(`<title>${ogTitle} · InComune</title>`));
  const desc = metaContent(html, 'property', 'og:description');
  assert.ok(desc.endsWith('Piazza &quot;Grande&quot; &lt;b&gt;&amp;&lt;/b&gt;'));
  // Ogni <meta> resta un tag ben formato: nessun doppio apice non escapato nei content.
  for (const line of html.split('\n').filter((l) => l.startsWith('<meta '))) {
    assert.match(line, /^<meta (name|property|charset)="?[^"]*"?( content="[^"]*")?>$/, line);
  }
});

test('a capo e caratteri di controllo del titolo diventano spazi', () => {
  const html = renderEventPage(ev({ title: `Sagra\n\tdel${cp(0)} vino${cp(0x2028)}  ` }), NOW);
  assert.equal(metaContent(html, 'property', 'og:title'), 'Sagra del vino');
});

test('i controlli bidirezionali spariscono', () => {
  const bidi = [0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069];
  assert.equal(cleanText(`Fe${cp(...bidi)}sta ${cp(0x202e)}assor${cp(0x2069)}`), 'Festa assor');
  assert.equal(cleanText(`${cp(0x202e)}  Piazza  ${cp(0x200f)}`), 'Piazza');
});

// ---- date in italiano, Europe/Rome ------------------------------------------

test('evento reale: Mercoledì 21 ottobre, ore 19:30 · Palazzo baronale', () => {
  assert.equal(formatDescription(ev(), NOW), 'Mercoledì 21 ottobre, ore 19:30 · Palazzo baronale');
});

test('senza luogo: solo la data, con la maiuscola', () => {
  assert.equal(formatDescription(ev({ location_name: '   ' }), NOW), 'Mercoledì 21 ottobre, ore 19:30');
  assert.equal(formatDescription(ev({ location_name: null }), NOW), 'Mercoledì 21 ottobre, ore 19:30');
});

test('cambio ora del 25 ottobre 2026 (03:00 CEST -> 02:00 CET)', () => {
  // Prima del cambio: UTC+2.
  assert.equal(formatWhen({ start_datetime: '2026-10-24T23:30:00Z' }, NOW), 'domenica 25 ottobre, ore 01:30');
  // 00:30 UTC = 02:30 CEST (prima delle 03:00 legali).
  assert.equal(formatWhen({ start_datetime: '2026-10-25T00:30:00Z' }, NOW), 'domenica 25 ottobre, ore 02:30');
  // 01:30 UTC = 02:30 CET (dopo il cambio: la stessa ora "ripetuta").
  assert.equal(formatWhen({ start_datetime: '2026-10-25T01:30:00Z' }, NOW), 'domenica 25 ottobre, ore 02:30');
  // Sera dopo il cambio: UTC+1.
  assert.equal(formatWhen({ start_datetime: '2026-10-25T18:00:00Z' }, NOW), 'domenica 25 ottobre, ore 19:00');
  assert.equal(formatWhen({ start_datetime: '2026-10-26T18:00:00Z' }, NOW), 'lunedì 26 ottobre, ore 19:00');
});

test('mezzanotte a Novoli e\' gia\' il giorno dopo in Italia', () => {
  assert.equal(formatWhen({ start_datetime: '2026-10-21T22:15:00Z' }, NOW), 'giovedì 22 ottobre, ore 00:15');
});

test('eventi di piu\' giorni: stesso mese, mesi diversi, anni diversi', () => {
  assert.equal(
    formatWhen({ start_datetime: '2026-10-24T16:00:00Z', end_datetime: '2026-10-26T21:00:00Z' }, NOW),
    'da sabato 24 a lunedì 26 ottobre',
  );
  assert.equal(
    formatWhen({ start_datetime: '2026-10-30T17:00:00Z', end_datetime: '2026-11-01T22:00:00Z' }, NOW),
    'da venerdì 30 ottobre a domenica 1 novembre',
  );
  assert.equal(
    formatWhen({ start_datetime: '2026-12-31T20:00:00Z', end_datetime: '2027-01-02T12:00:00Z' }, NOW),
    'da giovedì 31 dicembre 2026 a sabato 2 gennaio 2027',
  );
  assert.equal(
    formatDescription({ start_datetime: '2026-10-24T16:00:00Z', end_datetime: '2026-10-26T21:00:00Z', location_name: 'Piazza' }, NOW),
    'Da sabato 24 a lunedì 26 ottobre · Piazza',
  );
});

test('serata che sfora la mezzanotte resta un giorno solo', () => {
  assert.equal(
    formatWhen({ start_datetime: '2026-10-24T19:00:00Z', end_datetime: '2026-10-24T23:30:00Z' }, NOW),
    'sabato 24 ottobre, ore 21:00',
  );
  // Fine prima dell'inizio (dato sporco): si mostra solo l'inizio.
  assert.equal(
    formatWhen({ start_datetime: '2026-10-24T19:00:00Z', end_datetime: '2026-10-20T10:00:00Z' }, NOW),
    'sabato 24 ottobre, ore 21:00',
  );
});

test('anno mostrato solo se diverso da quello in corso', () => {
  assert.equal(formatWhen({ start_datetime: '2027-01-06T15:00:00Z' }, NOW), 'mercoledì 6 gennaio 2027, ore 16:00');
  assert.equal(
    formatWhen({ start_datetime: '2027-01-02T15:00:00Z', end_datetime: '2027-01-04T15:00:00Z' }, NOW),
    'da sabato 2 a lunedì 4 gennaio 2027',
  );
});

// ---- inizio e fine come nell'app ------------------------------------------------

test('romeEndOfDayMs: 23:59:59.999 ora di Novoli, anche nel giorno del cambio d\'ora', () => {
  // CEST (UTC+2)
  assert.equal(romeEndOfDayMs(Date.parse('2026-10-21T17:30:00Z')), Date.parse('2026-10-21T21:59:59.999Z'));
  // Giorno del cambio: a mezzanotte e' gia' CET (UTC+1).
  assert.equal(romeEndOfDayMs(Date.parse('2026-10-25T08:00:00Z')), Date.parse('2026-10-25T22:59:59.999Z'));
  // 23:30 UTC del 24 = 01:30 del 25 a Novoli: conta il giorno di Novoli.
  assert.equal(romeEndOfDayMs(Date.parse('2026-10-24T23:30:00Z')), Date.parse('2026-10-25T22:59:59.999Z'));
  // CET
  assert.equal(romeEndOfDayMs(Date.parse('2026-11-17T10:00:00Z')), Date.parse('2026-11-17T22:59:59.999Z'));
  // Primavera: 29 marzo 2026 si passa a CEST.
  assert.equal(romeEndOfDayMs(Date.parse('2026-03-29T10:00:00Z')), Date.parse('2026-03-29T21:59:59.999Z'));
});

test('senza programma: fine = end_datetime ?? start_datetime (program_* ignorati)', () => {
  assert.deepEqual(eventSpan(ev()), { startMs: Date.parse('2026-10-21T17:30:00Z'), endMs: Date.parse('2026-10-21T17:30:00Z') });
  assert.equal(eventSpan(ev({ end_datetime: '2026-10-21T21:00:00Z' })).endMs, Date.parse('2026-10-21T21:00:00Z'));
  // has_program falso: un program_end_at rimasto nel DB non conta, come nell'app.
  assert.equal(eventSpan(ev({ program_end_at: '2026-10-30T21:00:00Z' })).endMs, Date.parse('2026-10-21T17:30:00Z'));
  assert.equal(eventSpan(ev({ start_datetime: 'boh' })), null);
  assert.equal(eventSpan(ev({ end_datetime: 'boh' })), null);
});

test('festa 31 ott - 2 nov con appuntamenti solo il 31: vale la fine del padre', () => {
  const festa = ev({
    has_program: true,
    start_datetime: '2026-10-31T17:00:00Z',
    end_datetime: '2026-11-02T22:00:00Z',
    program_start_at: '2026-10-31T17:00:00Z',
    program_end_at: '2026-10-31T22:30:00Z',
  });
  assert.equal(eventSpan(festa).endMs, Date.parse('2026-11-02T22:00:00Z'));
  assert.equal(formatWhen(festa, NOW), 'da sabato 31 ottobre a lunedì 2 novembre');
  // Locandina viva fino a fine + 24 h del padre, non del programma.
  assert.equal(posterVisible(festa, Date.parse('2026-11-03T21:00:00Z')), true);
  assert.equal(posterVisible(festa, Date.parse('2026-11-03T22:00:00Z')), false);
  // Finestra: 30 giorni dalla fine del padre.
  assert.equal(isInWindow(festa, Date.parse('2026-12-02T21:00:00Z')), true);
  assert.equal(isInWindow(festa, Date.parse('2026-12-02T23:00:00Z')), false);
});

test('programma che va oltre il padre: vince program_end_at, e program_start_at anticipa', () => {
  const sagra = ev({
    has_program: true,
    start_datetime: '2026-10-24T16:00:00Z',
    end_datetime: '2026-10-24T20:00:00Z',
    program_start_at: '2026-10-23T16:00:00Z',
    program_end_at: '2026-10-25T21:00:00Z',
  });
  assert.deepEqual(eventSpan(sagra), {
    startMs: Date.parse('2026-10-23T16:00:00Z'),
    endMs: Date.parse('2026-10-25T21:00:00Z'),
  });
  assert.equal(formatWhen(sagra, NOW), 'da venerdì 23 a domenica 25 ottobre');
});

test('programma senza fine del padre: fine effettiva alle 23:59 di Novoli del giorno d\'inizio', () => {
  const p = ev({ has_program: true, start_datetime: '2026-10-21T17:30:00Z', program_end_at: '2026-10-21T20:00:00Z' });
  assert.equal(eventSpan(p).endMs, Date.parse('2026-10-21T21:59:59.999Z'));
  assert.equal(formatWhen(p, NOW), 'mercoledì 21 ottobre, ore 19:30');
  // Senza programma la stessa riga finisce all'inizio (regola della locandina nell'app).
  assert.equal(eventSpan({ ...p, has_program: false }).endMs, Date.parse('2026-10-21T17:30:00Z'));
});

// ---- locandina ---------------------------------------------------------------

test('POSTER_DAL: logo fino al 31 ott 23:59:59 CET, locandina dal 1 nov 00:00', () => {
  assert.equal(POSTER_DAL, Date.parse('2026-11-01T00:00:00+01:00'));
  const e = ev({ start_datetime: '2026-11-01T18:00:00Z' });
  assert.equal(posterCandidate(e, POSTER_DAL - 1), null);
  assert.equal(ogImage(e, POSTER_DAL - 1, OK()).url, FALLBACK_IMAGE);
  assert.equal(posterCandidate(e, POSTER_DAL), IMG);
  assert.equal(ogImage(e, POSTER_DAL, OK()).url, IMG);
});

test('prima del POSTER_DAL l\'evento reale ha il logo anche con peso ok', () => {
  const html = renderEventPage(ev(), NOW, OK());
  assert.equal(metaContent(html, 'property', 'og:image'), FALLBACK_IMAGE);
});

test('locandina visibile fino a fine + 24 h, poi il logo', () => {
  const end = eventSpan(NOV).endMs;
  assert.equal(posterVisible(NOV, end + 23 * H), true);
  assert.equal(posterVisible(NOV, end + 24 * H), false);
  assert.equal(ogImage(NOV, end + 23 * H, OK()).url, IMG);
  assert.equal(ogImage(NOV, end + 25 * H, OK()).url, FALLBACK_IMAGE);
});

test('con programma la locandina segue la fine del programma', () => {
  const e = ev({
    has_program: true,
    start_datetime: '2026-11-10T18:00:00Z',
    end_datetime: '2026-11-10T20:00:00Z',
    program_end_at: '2026-11-19T00:00:00Z',
  });
  const now = Date.parse('2026-11-19T20:00:00Z'); // 20 h dopo la fine del programma
  assert.equal(posterVisible(e, now), true);
  assert.equal(posterVisible({ ...e, program_end_at: null }, now), false);
});

test('peso della locandina: fino a 600.000 byte, 200 e Content-Length leggibile', () => {
  assert.equal(POSTER_MAX_BYTES, 600000);
  const h = (contentLength, over = {}) => ({ ok: true, status: 200, contentLength, ...over });
  assert.equal(posterSizeOk(h('600000')), true);
  assert.equal(posterSizeOk(h('1')), true);
  assert.equal(posterSizeOk(h('600001')), false);
  assert.equal(posterSizeOk(h('614400')), false);
  assert.equal(posterSizeOk(h('0')), false);
  assert.equal(posterSizeOk(h(null)), false);
  assert.equal(posterSizeOk(h('12abc')), false);
  assert.equal(posterSizeOk(h('-5')), false);
  assert.equal(posterSizeOk(h('100', { status: 206 })), false);
  assert.equal(posterSizeOk(h('100', { ok: false, status: 404 })), false);
  assert.equal(posterSizeOk(null), false); // HEAD fallita o scaduta
});

test('formato della locandina: solo jpeg, png, webp', () => {
  const t = (contentType) => ({ ok: true, status: 200, contentLength: '1000', contentType });
  for (const ok of ['image/jpeg', 'image/png', 'image/webp', 'IMAGE/JPEG', 'image/webp; charset=binary', ' image/png ;q=1']) {
    assert.equal(posterTypeOk(t(ok)), true, ok);
    assert.equal(posterHeadOk(t(ok)), true, ok);
  }
  for (const bad of ['image/gif', 'image/svg+xml', 'image/heic', 'application/octet-stream', 'text/html', 'image/jpg', '', null]) {
    assert.equal(posterTypeOk(t(bad)), false, String(bad));
    assert.equal(posterHeadOk(t(bad)), false, String(bad));
  }
  // Formato giusto ma peso oltre il tetto: logo.
  assert.equal(posterHeadOk({ ok: true, status: 200, contentLength: '600001', contentType: 'image/jpeg' }), false);
  assert.equal(posterTypeOk(null), false);
});

test('peso non verificato o troppo grande: logo', () => {
  assert.equal(ogImage(NOV, NOV_NOW).url, FALLBACK_IMAGE);
  assert.equal(ogImage(NOV, NOV_NOW, new Map([[IMG, false]])).url, FALLBACK_IMAGE);
  assert.equal(ogImage(NOV, NOV_NOW, OK('https://altro')).url, FALLBACK_IMAGE);
  assert.deepEqual(ogImage(NOV, NOV_NOW, OK()), { url: IMG, isPoster: true });
});

test('posterCandidates: solo URL ammessi e visibili, senza doppioni', () => {
  const other = ev({ id: '11111111-2222-4333-8444-555555555555', start_datetime: '2026-11-21T18:00:00Z' });
  const evil = ev({ id: '22222222-2222-4333-8444-555555555555', image_url: 'https://evil.example/x.jpg' });
  const none = ev({ id: '33333333-2222-4333-8444-555555555555', image_url: null });
  assert.deepEqual(posterCandidates([NOV, other, evil, none], NOV_NOW), [IMG]);
  assert.deepEqual(posterCandidates([NOV], NOW), []); // prima del POSTER_DAL
});

test('senza image_url: logo con dimensioni', () => {
  const html = renderEventPage(ev({ image_url: null }), NOW);
  assert.equal(metaContent(html, 'property', 'og:image'), FALLBACK_IMAGE);
  assert.equal(metaContent(html, 'property', 'og:image:width'), '1200');
  assert.equal(metaContent(html, 'name', 'twitter:image'), FALLBACK_IMAGE);
});

test('URL immagine: solo https del bucket event-images del progetto', () => {
  assert.equal(allowedImageUrl(IMG), IMG);
  const bad = [
    'http://dijicgloszsmomgyxjlf.supabase.co/storage/v1/object/public/event-images/a.jpg',
    'https://evil.example/storage/v1/object/public/event-images/a.jpg',
    'https://dijicgloszsmomgyxjlf.supabase.co.evil.example/storage/v1/object/public/event-images/a.jpg',
    'https://user:pw@dijicgloszsmomgyxjlf.supabase.co/storage/v1/object/public/event-images/a.jpg',
    'https://dijicgloszsmomgyxjlf.supabase.co:8443/storage/v1/object/public/event-images/a.jpg',
    'https://dijicgloszsmomgyxjlf.supabase.co/storage/v1/object/public/avatars/a.jpg',
    'https://dijicgloszsmomgyxjlf.supabase.co/storage/v1/object/public/event-images/../avatars/a.jpg',
    'https://dijicgloszsmomgyxjlf.supabase.co/storage/v1/object/public/event-images/%2e%2e/avatars/a.jpg',
    'https://dijicgloszsmomgyxjlf.supabase.co/storage/v1/object/public/event-images/',
    'javascript:alert(1)',
    'non un url',
    '',
    null,
  ];
  for (const u of bad) assert.equal(allowedImageUrl(u), null, String(u));
  const evil = ev({ start_datetime: NOV.start_datetime, image_url: bad[1] });
  const html = renderEventPage(evil, NOV_NOW, OK(bad[1]));
  assert.equal(metaContent(html, 'property', 'og:image'), FALLBACK_IMAGE);
});

test('la query ?v= della locandina resta, con & escapato', () => {
  const url = `https://dijicgloszsmomgyxjlf.supabase.co/storage/v1/object/public/event-images/${ID}.jpg?v=1&x="y"`;
  const normalized = allowedImageUrl(url);
  const html = renderEventPage({ ...NOV, image_url: url }, NOV_NOW, OK(normalized));
  const og = metaContent(html, 'property', 'og:image');
  assert.ok(og.includes('?v=1&amp;x=%22y%22'), og);
  assert.equal(metaContent(html, 'property', 'og:image:width'), null);
});

// ---- finestra, id, selezione, guardia -------------------------------------------

test('finestra: fine a non piu\' di 30 giorni fa', () => {
  const at = (iso) => ({ start_datetime: iso });
  assert.equal(isInWindow(at(new Date(NOW - 29 * D).toISOString()), NOW), true);
  assert.equal(isInWindow(at(new Date(NOW - 30 * D).toISOString()), NOW), true);
  assert.equal(isInWindow(at(new Date(NOW - 30 * D - 1000).toISOString()), NOW), false);
  // Inizio vecchio ma programma finito da poco: dentro.
  assert.equal(
    isInWindow({ has_program: true, start_datetime: '2026-08-01T10:00:00Z', program_end_at: '2026-10-01T10:00:00Z' }, NOW),
    true,
  );
  // end_datetime conta.
  assert.equal(isInWindow({ start_datetime: '2026-08-01T10:00:00Z', end_datetime: '2026-09-25T10:00:00Z' }, NOW), true);
  assert.equal(isInWindow({ start_datetime: '2026-08-01T10:00:00Z', end_datetime: '2026-09-15T10:00:00Z' }, NOW), false);
});

test('UUID: solo forma canonica minuscola', () => {
  assert.equal(isUuid(ID), true);
  for (const bad of ['../../index', `${ID}/../x`, ID.toUpperCase(), `${ID}.html`, '', null, 42]) {
    assert.equal(isUuid(bad), false, String(bad));
  }
  assert.throws(() => renderEventPage(ev({ id: '../x' }), NOW));
});

test('selectEvents scarta id non validi, non approvati, figli, fuori finestra, duplicati', () => {
  const rows = [
    ev(),
    ev(), // duplicato
    ev({ id: '../../index' }),
    ev({ id: '11111111-2222-4333-8444-555555555555', status: 'pending' }),
    ev({ id: '22222222-2222-4333-8444-555555555555', start_datetime: '2026-08-01T10:00:00Z' }),
    ev({ id: '33333333-2222-4333-8444-555555555555', start_datetime: 'non una data' }),
    ev({ id: '44444444-2222-4333-8444-555555555555', parent_event_id: ID }),
    null,
  ];
  const { events, skipped } = selectEvents(rows, NOW);
  assert.deepEqual(events.map((e) => e.id), [ID]);
  assert.deepEqual(skipped, { invalidId: 2, notApproved: 1, child: 1, invalidDate: 1, outOfWindow: 1, duplicate: 1 });
  assert.deepEqual(buildPages(events, NOW).map((p) => p.file), [`eventi/${ID}.html`]);
});

test('guardia: 0 eventi o risposta non-array fermano il deploy', () => {
  assert.throws(() => assertRows([]), /0 eventi/);
  assert.throws(() => assertRows({ message: 'JWT expired' }), /non è un array/);
  assert.throws(() => assertRows(null, { allowEmpty: true }), /non è un array/);
  assert.doesNotThrow(() => assertRows([], { allowEmpty: true }));
  assert.doesNotThrow(() => assertRows([ev()]));
});

// ---- pagina completa ---------------------------------------------------------

test('pagina reale: meta OG completi e coerenti', () => {
  const html = renderEventPage(ev(), NOW);
  const t = 'Detto per la prima volta';
  const d = 'Mercoledì 21 ottobre, ore 19:30 · Palazzo baronale';
  assert.ok(html.includes(`<title>${t} · InComune</title>`));
  assert.equal(metaContent(html, 'name', 'description'), d);
  assert.equal(metaContent(html, 'name', 'robots'), 'noindex');
  assert.equal(metaContent(html, 'property', 'og:title'), t);
  assert.equal(metaContent(html, 'property', 'og:description'), d);
  assert.equal(metaContent(html, 'property', 'og:type'), 'website');
  assert.equal(metaContent(html, 'property', 'og:url'), `https://incomune.app/eventi/${ID}`);
  assert.equal(metaContent(html, 'property', 'og:site_name'), 'InComune');
  assert.equal(metaContent(html, 'property', 'og:locale'), 'it_IT');
  assert.equal(metaContent(html, 'property', 'og:image'), FALLBACK_IMAGE); // prima del POSTER_DAL
  assert.equal(metaContent(html, 'property', 'og:image:alt'), t);
  assert.equal(metaContent(html, 'name', 'twitter:card'), 'summary_large_image');
  assert.equal(metaContent(html, 'name', 'twitter:title'), t);
  assert.equal(metaContent(html, 'name', 'twitter:description'), d);
  assert.equal(metaContent(html, 'name', 'twitter:image'), FALLBACK_IMAGE);
  assert.ok(html.includes(`<h1 class="t-title" style="margin:6px 0 10px;">${t}</h1>`));
  assert.ok(html.includes(`<p class="event-when">${d}</p>`));
  assert.ok(!html.includes(cp(0x2013)) && !html.includes(cp(0x2014)), 'niente trattini lunghi');
});
