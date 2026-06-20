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
  s = pick(s, currentPair(s)[0]).state; // a vs b -> a
  s = pick(s, currentPair(s)[0]).state; // c vs d -> c
  assert.equal(s.round, 2);
  assert.deepEqual(s.contestants, ['a','c']);
  assert.equal(s.index, 0);
});
