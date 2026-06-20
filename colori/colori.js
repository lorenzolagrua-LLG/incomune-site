// colori/colori.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CANDIDATES } from './colors.js';
import { createTournament, currentPair, pick } from './bracket.js';
import { renderMockupHTML } from './mockup.js';

const SUPABASE_URL = 'https://ssehydigsdydmhulotws.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_KxhhOiKttmm_nmKPHbV_Kw_vi0ASLry';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const byKey = Object.fromEntries(CANDIDATES.map(c => [c.key, c]));
const el = id => document.getElementById(id);

const TOTAL_MATCHES = CANDIDATES.length - 1; // sfide totali nel bracket (16 -> 15)

let state = null;
let sessionId = null;
let nickname = null;
let locked = false; // anti doppio-tap: un tocco rapido non deve votare la coppia successiva
let picksMade = 0;

function updateBar() {
  const pct = Math.round((picksMade / TOTAL_MATCHES) * 100);
  el('bar').style.width = pct + '%';
  const track = document.querySelector('.progressbar');
  if (track) {
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', String(pct));
  }
}

function renderPair() {
  const pair = currentPair(state);
  if (!pair) return renderFinal();
  const [a, b] = pair;
  el('choiceA').innerHTML = renderMockupHTML(byKey[a]);
  el('choiceB').innerHTML = renderMockupHTML(byKey[b]);
  el('progress').textContent = `Round ${state.round} di ${state.totalRounds}`;
  updateBar();
}

async function choose(winnerKey) {
  if (locked) return;
  locked = true;
  setTimeout(() => { locked = false; }, 300);

  const { state: next, matchup } = pick(state, winnerKey);
  state = next;
  picksMade++;
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
  locked = false;
  picksMade = 0;
  updateBar();
  el('intro').hidden = true;
  el('final').hidden = true;
  el('game').hidden = false;
  renderPair();
}

// Sceglie lo sfidante in posizione `i` della coppia corrente, se esiste.
function pickAt(i) {
  const pair = currentPair(state);
  if (pair) choose(pair[i]);
}

el('start').addEventListener('click', startGame);
el('again').addEventListener('click', () => { el('final').hidden = true; el('intro').hidden = false; });
el('choiceA').addEventListener('click', () => pickAt(0));
el('choiceB').addEventListener('click', () => pickAt(1));
