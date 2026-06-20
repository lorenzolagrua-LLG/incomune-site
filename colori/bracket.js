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
