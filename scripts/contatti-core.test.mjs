// node --test scripts/contatti-core.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHANNELS,
  PEOPLE,
  counts,
  effectiveChannel,
  filterRows,
  formatWhen,
  keyOf,
  mergeRows,
  normalize,
  readToken,
  sortByName,
  takenOver,
} from '../contatti/core.mjs';

test('filterRows ignora apostrofi e spazi: «santantonio» e «sant antonio» trovano «Sant\'Antonio»', () => {
  const rows = [row("Chiesa di Sant'Antonio"), row('Bar Centrale')];
  assert.deepEqual(filterRows(rows, { query: 'santantonio' }).map((r) => r.name), ["Chiesa di Sant'Antonio"]);
  assert.deepEqual(filterRows(rows, { query: 'sant antonio' }).map((r) => r.name), ["Chiesa di Sant'Antonio"]);
  assert.deepEqual(filterRows(rows, { query: 'barcentrale' }).map((r) => r.name), ['Bar Centrale']);
});

test('effectiveChannel: su una scheda già contattata vale il canale salvato se non ne scegli un altro', () => {
  const done = row('A', { contacted_at: '2026-11-19T17:42:00Z', channel: 'instagram' });
  assert.equal(effectiveChannel(null, done), 'instagram');
  assert.equal(effectiveChannel('call', done), 'call');
  assert.equal(effectiveChannel(null, row('B')), null);
  assert.equal(effectiveChannel(null, undefined), null);
});

test('mergeRows tiene la versione locale delle righe con scrittura in volo', () => {
  const local = row('A', { contacted_at: '2026-11-19T17:42:00Z', channel: 'call', contacted_by: 'Luca' });
  const prev = new Map([[keyOf(local), local]]);
  const fromServer = [row('A'), row('B')];
  const next = mergeRows(prev, fromServer, new Set([keyOf(local)]));
  assert.equal(next.get(keyOf(local)).contacted_by, 'Luca');
  assert.equal(next.size, 2);
  const noPending = mergeRows(prev, fromServer, new Set());
  assert.equal(noPending.get(keyOf(local)).contacted_at, null);
});

test('takenOver: vero solo se una riga da contattare risulta ora contattata', () => {
  const todo = row('A');
  const done = row('A', { contacted_at: '2026-11-19T17:42:00Z', contacted_by: 'Mario' });
  assert.equal(takenOver(todo, done), true);
  assert.equal(takenOver(done, done), false);
  assert.equal(takenOver(todo, todo), false);
  assert.equal(takenOver(undefined, done), false);
});

const row = (name, extra = {}) => ({
  entity_type: 'business',
  entity_id: name,
  name,
  contacted_at: null,
  channel: null,
  contacted_by: null,
  ...extra,
});

test('normalize toglie accenti, maiuscole e apostrofi tipografici', () => {
  assert.equal(normalize('Caffè L’Angolo'), "caffe l'angolo");
  assert.equal(normalize('  Bar   Centrale '), 'bar centrale');
  assert.equal(normalize(null), '');
});

test('filterRows trova «Caffè» cercando «caffe» e «L’Angolo» cercando «l\'angolo»', () => {
  const rows = [row('Caffè Roma'), row('L’Angolo'), row('Pizzeria')];
  assert.deepEqual(filterRows(rows, { query: 'caffe', status: 'all' }).map((r) => r.name), ['Caffè Roma']);
  assert.deepEqual(filterRows(rows, { query: "l'angolo", status: 'all' }).map((r) => r.name), ['L’Angolo']);
  assert.equal(filterRows(rows, { query: '', status: 'all' }).length, 3);
});

test('filterRows per stato: todo esclude i contattati, done li tiene', () => {
  const rows = [row('A'), row('B', { contacted_at: '2026-11-19T17:42:00Z' })];
  assert.deepEqual(filterRows(rows, { query: '', status: 'todo' }).map((r) => r.name), ['A']);
  assert.deepEqual(filterRows(rows, { query: '', status: 'done' }).map((r) => r.name), ['B']);
});

test('sortByName in ordine alfabetico italiano, accenti e maiuscole ignorati', () => {
  const rows = [row('bar'), row('Zeta'), row('Àncora'), row('Bar Due')];
  assert.deepEqual(sortByName(rows).map((r) => r.name), ['Àncora', 'bar', 'Bar Due', 'Zeta']);
});

test('sortByName non modifica l\'array di partenza', () => {
  const rows = [row('B'), row('A')];
  sortByName(rows);
  assert.equal(rows[0].name, 'B');
});

test('counts conta contattati e totale per sezione', () => {
  const rows = [
    row('A'),
    row('B', { contacted_at: '2026-11-19T17:42:00Z' }),
    row('C', { entity_type: 'church', contacted_at: '2026-11-19T17:42:00Z' }),
  ];
  assert.deepEqual(counts(rows), {
    business: { done: 1, total: 2 },
    association: { done: 0, total: 0 },
    church: { done: 1, total: 1 },
  });
});

test('formatWhen scrive l\'ora italiana (CET in novembre, CEST in estate)', () => {
  assert.equal(formatWhen('2026-11-19T17:42:00Z'), 'gio 19 nov, 18:42');
  assert.equal(formatWhen('2026-07-01T08:05:00Z'), 'mer 1 lug, 10:05');
});

test('readToken: frammento lungo vince, corto o assente ripiega sul ricordato', () => {
  const t = 'x'.repeat(32);
  assert.equal(readToken('#' + t, null), t);
  assert.equal(readToken('#abc', null), null);
  assert.equal(readToken('', t), t);
  assert.equal(readToken('#' + t, 'y'.repeat(32)), t);
  assert.equal(readToken('', null), null);
});

test('CHANNELS e PEOPLE come da spec', () => {
  assert.deepEqual(CHANNELS, [
    { id: 'facebook', label: 'Facebook' },
    { id: 'instagram', label: 'Instagram' },
    { id: 'whatsapp_sms', label: 'WhatsApp/SMS' },
    { id: 'call', label: 'Chiamata' },
  ]);
  assert.deepEqual(PEOPLE, ['Lorenzo', 'Mario', 'Marta', 'Luca']);
});
