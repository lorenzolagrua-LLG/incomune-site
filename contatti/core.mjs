// Logica pura della pagina /contatti/ (testata in scripts/contatti-core.test.mjs).

export const CHANNELS = [
  { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'whatsapp_sms', label: 'WhatsApp/SMS' },
  { id: 'call', label: 'Chiamata' },
];

export const PEOPLE = ['Lorenzo', 'Mario', 'Marta', 'Luca'];

export const SECTIONS = [
  { type: 'business', title: 'Attività' },
  { type: 'association', title: 'Associazioni' },
  { type: 'church', title: 'Chiese' },
];

const MIN_TOKEN = 24;

export function normalize(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ`´]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function sortByName(rows) {
  return [...rows].sort((a, b) =>
    String(a.name ?? '').localeCompare(String(b.name ?? ''), 'it', { sensitivity: 'base' }),
  );
}

// Solo lettere e cifre: «Sant'Antonio» -> «santantonio».
const compact = (s) => normalize(s).replace(/[^\p{L}\p{N}]/gu, '');

export function filterRows(rows, { query = '', status = 'all' } = {}) {
  const q = normalize(query);
  const qc = compact(query);
  return rows.filter((r) => {
    if (status === 'todo' && r.contacted_at) return false;
    if (status === 'done' && !r.contacted_at) return false;
    if (!q) return true;
    return normalize(r.name).includes(q) || (qc !== '' && compact(r.name).includes(qc));
  });
}

export const keyOf = (r) => `${r.entity_type}:${r.entity_id}`;

// Canale da salvare: quello scelto nel pannello, altrimenti quello già registrato.
export function effectiveChannel(chosen, r) {
  return chosen ?? (r?.contacted_at ? r.channel : null);
}

// Righe dal server, tranne quelle con una scrittura in volo: lì vale la copia locale.
export function mergeRows(prev, data, pending) {
  const next = new Map();
  for (const r of data) {
    const k = keyOf(r);
    next.set(k, pending.has(k) && prev.has(k) ? prev.get(k) : r);
  }
  return next;
}

// La riga era da contattare e intanto qualcun altro l'ha segnata.
export function takenOver(before, after) {
  return !!before && !!after && !before.contacted_at && !!after.contacted_at;
}

export function counts(rows) {
  const out = {};
  for (const { type } of SECTIONS) out[type] = { done: 0, total: 0 };
  for (const r of rows) {
    const c = out[r.entity_type];
    if (!c) continue;
    c.total += 1;
    if (r.contacted_at) c.done += 1;
  }
  return out;
}

const WHEN_FMT = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatWhen(iso) {
  const p = Object.fromEntries(WHEN_FMT.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute}`;
}

export function readToken(hash, stored) {
  const h = String(hash ?? '').replace(/^#/, '');
  if (h.length >= MIN_TOKEN) return h;
  return stored && stored.length >= MIN_TOKEN ? stored : null;
}
