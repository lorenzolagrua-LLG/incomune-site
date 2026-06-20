// colori/risultati/risultati.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CANDIDATES } from '../colors.js';

const SUPABASE_URL = 'https://ssehydigsdydmhulotws.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_KxhhOiKttmm_nmKPHbV_Kw_vi0ASLry';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const byKey = Object.fromEntries(CANDIDATES.map(c => [c.key, c]));

// I dati dell'RPC sono non fidati: vanno sanificati prima di finire nell'HTML.
const esc = s => String(s).replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const safeHex = v => (/^#[0-9a-fA-F]{3,8}$/.test(String(v)) ? String(v) : '#cccccc');

async function load() {
  const { data, error } = await supabase.rpc('color_leaderboard');
  const status = document.getElementById('status');
  if (error) { status.textContent = 'Errore nel caricamento.'; console.error(error); return; }
  if (!data || !data.length) { status.textContent = 'Ancora nessun voto.'; return; }
  const tbody = document.querySelector('#board tbody');
  tbody.innerHTML = data.map(r => {
    const c = byKey[r.color_key] || { label: r.color_key, hex: '#cccccc' };
    const pct = r.win_rate == null ? '-' : Math.round(r.win_rate * 100) + '%';
    return `<tr>
      <td><span style="display:inline-block;width:16px;height:16px;border-radius:4px;background:${safeHex(c.hex)}"></span></td>
      <td>${esc(c.label)}</td><td>${pct}</td><td>${Number(r.wins)}</td><td>${Number(r.appearances)}</td><td>${Number(r.champion_count)}</td>
    </tr>`;
  }).join('');
  status.hidden = true;
  document.getElementById('board').hidden = false;
}
load();
