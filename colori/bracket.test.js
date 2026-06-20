// colori/bracket.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shuffle, createTournament, currentPair, pick } from './bracket.js';

// rng deterministico (sempre 0): rende il test riproducibile. Non assumere che
// conservi l'ordine originale: il bracket lavora sull'ordine mescolato, quindi i
// test derivano le aspettative dall'ordine effettivo, non da quello di partenza.
const rng0 = () => 0;
// rng "identità": con valori ~1 ogni swap di Fisher-Yates è j===i (no-op), quindi
// l'ordine resta invariato. Permette di verificare QUALI chiavi avanzano.
const rngId = () => 0.999;

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
  assert.ok(keys.includes(s.champion)); // il campione e una delle chiavi iniziali
});

test('avanzamento round: i vincitori del round 1 avanzano nell ordine giusto', () => {
  // rngId non mescola: contestants restano ['a','b','c','d'], quindi verifichiamo
  // in modo indipendente QUALI chiavi avanzano (non derivate dall implementazione).
  const keys = ['a','b','c','d'];
  let s = createTournament(keys, rngId);
  assert.deepEqual(s.contestants, ['a','b','c','d']);
  s = pick(s, 'a').state; // a vs b -> a
  s = pick(s, 'c').state; // c vs d -> c
  assert.equal(s.round, 2);
  assert.deepEqual(s.contestants, ['a','c']);
  assert.equal(s.index, 0);
});

test('pick rifiuta un vincitore che non e tra gli sfidanti', () => {
  const s = createTournament(['a','b','c','d'], rngId);
  assert.throws(() => pick(s, 'z'), /non e tra gli sfidanti/);
});
