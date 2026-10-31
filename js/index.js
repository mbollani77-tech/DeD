import { configured, createCampaign, verifyMaster, findCampaign } from './db.js';
import { $, toast } from './ui.js';
import { center, dist, SQ3 } from './hex.js';

// Mappa decorativa: un eroe, il suo raggio di movimento, un goblin e un forziere.
(function hero() {
  const svg = $('#hero-map'); const S = 20, cols = 11, rows = 9; const hero = { col: 4, row: 4 };
  const pts = (cx, cy) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 180 * (60 * i - 30); return `${(cx + (S - .7) * Math.cos(a)).toFixed(1)},${(cy + (S - .7) * Math.sin(a)).toFixed(1)}`; }).join(' ');
  let h = '';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const [x, y] = center(c, r, S); const d = dist(hero, { col: c, row: r });
    const wall = (c === 8 && r >= 2 && r <= 5) || (c === 0) || (r === 0);
    const fill = wall ? '#4b5964' : d > 0 && d <= 3 ? '#6cc3b8' : (c === 6 && r === 4) ? '#e08b84' : (c + r) % 3 ? '#cdd4cd' : '#c3cac3';
    h += `<polygon class="hx" fill="${fill}" points="${pts(x + 14, y + 16)}"/>`;
  }
  const tok = (col, row, cls, txt) => { const [x, y] = center(col, row, S); return `<g class="tok ${cls}" transform="translate(${x + 14},${y + 16})"><circle r="${S * .68}"/><text class="ini" y="1">${txt}</text></g>`; };
  const [tx, ty] = center(7, 6, S);
  h += tok(hero.col, hero.row, 'pc me', 'El') + tok(6, 4, 'monster', 'Go');
  h += `<text class="glyph" text-anchor="middle" dominant-baseline="central" font-size="${S}" x="${tx + 14}" y="${ty + 16}">💰</text>`;
  svg.innerHTML = h; svg.setAttribute('viewBox', `0 0 ${SQ3 * S * (cols + .5) + 28} ${S * 1.5 * rows + 36}`);
})();

if (!configured) $('#cfg-warn').hidden = false;
const saved = JSON.parse(localStorage.getItem('dnd.master') || 'null');
if (saved) { $('#resume').hidden = false; $('#resume-name').textContent = `Campagna ${saved.name || ''} (codice ${saved.code})`; }

const go = (el, fn) => el.addEventListener('submit', async e => {
  e.preventDefault(); const b = el.querySelector('button'); b.disabled = true;
  try { await fn(); } catch (err) { toast(err.message || 'Qualcosa non ha funzionato', 'err'); } finally { b.disabled = false; }
});

go($('#f-new'), async () => {
  const name = $('#n-name').value.trim();
  const r = await createCampaign(name);
  localStorage.setItem('dnd.master', JSON.stringify({ id: r.id, code: r.code, key: r.master_key, name }));
  $('#c-code').textContent = r.code; $('#c-key').textContent = r.master_key; $('#created').hidden = false;
});

go($('#f-master'), async () => {
  const code = $('#m-code').value.trim().toUpperCase(), key = $('#m-key').value.trim();
  const id = await verifyMaster(code, key);
  if (!id) throw new Error('Codice o chiave non corretti.');
  localStorage.setItem('dnd.master', JSON.stringify({ id, code, key }));
  location.href = 'master.html';
});

go($('#f-player'), async () => {
  const code = $('#p-code').value.trim().toUpperCase();
  const id = await findCampaign(code);
  if (!id) throw new Error('Nessuna campagna con questo codice.');
  localStorage.setItem('dnd.join', JSON.stringify({ id, code }));
  location.href = 'player.html';
});
