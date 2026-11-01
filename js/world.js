// Mappa del mondo: terreni, strade, paesi, luoghi da visitare e incontri durante il viaggio.
import { pick, shuffle, rollDie } from './dice.js';
import { key, dist, neighbors } from './hex.js';

/** Terreni: cell = tipo di cella per il movimento ('' pavimento, 'd' difficile, 'a' guado, 'w' invalicabile). enc = soglia del d20 per un incontro. */
export const TERRAIN = {
  P: { nome: 'Pianura', cell: '', enc: 2, theme: 'foresta', pool: ['lupo', 'ratto', 'goblin', 'coboldo'], color: ['#a9c27a', '#a1ba72', '#b1c883'] },
  S: { nome: 'Strada', cell: '', enc: 1, theme: 'foresta', pool: ['goblin', 'gnoll', 'orco', 'lupo'], color: ['#dccda6', '#d5c59b', '#e2d4af'] },
  B: { nome: 'Bosco', cell: 'd', enc: 3, theme: 'foresta', pool: ['lupo', 'goblin', 'goblin-arciere', 'gnoll', 'coboldo'], color: ['#5d8a50', '#54814a', '#669659'] },
  C: { nome: 'Colline', cell: '', enc: 2, theme: 'caverna', pool: ['orco', 'gnoll', 'bugbear', 'lupo'], color: ['#bdb57c', '#b5ad74', '#c5bd86'] },
  M: { nome: 'Montagne', cell: 'w', enc: 0, theme: 'caverna', pool: ['orco'], color: ['#8d9095', '#868a8f', '#94979c'] },
  F: { nome: 'Fiume', cell: 'a', enc: 2, theme: 'foresta', pool: ['ratto', 'coboldo', 'goblin'], color: ['#6aa5d4', '#639ecd', '#72acdb'] },
  L: { nome: 'Palude', cell: 'd', enc: 3, theme: 'caverna', pool: ['zombi', 'ratto', 'scheletro', 'coboldo'], color: ['#72906a', '#6a8962', '#7a9873'] },
};

export const terrainAt = (room, col, row) => room.meta?.terrain?.[row]?.[col] || 'P';

const NOUNS = [['Borgo', 'm'], ['Rocca', 'f'], ['Ponte', 'm'], ['Fonte', 'f'], ['Colle', 'm'], ['Selva', 'f'], ['Villa', 'f'], ['Castello', 'm'], ['Valle', 'f'], ['Porto', 'm']];
const ADJ = [['Alta', 'Alto'], ['Chiara', 'Chiaro'], ['Verde', 'Verde'], ['Dorata', 'Dorato'], ['Nera', 'Nero'], ['Vecchia', 'Vecchio'], ['Rossa', 'Rosso'], ['Serena', 'Sereno'], ['Fiorita', 'Fiorito'], ['Antica', 'Antico']];
const OASIS = ['Oasi del Tramonto', 'Fonte Segreta', 'Pozza Quieta', 'Oasi Smeralda', 'Rifugio dei Pellegrini', 'Sorgente Dorata', 'Oasi dei Sospiri', 'Fontana Antica'];
export const oasisName = i => OASIS[i % OASIS.length];
export const townName = () => { const [n, g] = pick(NOUNS); const a = pick(ADJ); return `${n} ${a[g === 'f' ? 0 : 1]}`; };

/* ---------- rumore ---------- */
function makeNoise() {
  const G = 24; const grid = Array.from({ length: G * G }, () => Math.random());
  const sm = t => t * t * (3 - 2 * t); const lerp = (a, b, t) => a + (b - a) * t;
  const g = (i, j) => grid[(((j % G) + G) % G) * G + (((i % G) + G) % G)];
  return (x, y, s) => { x /= s; y /= s; const x0 = Math.floor(x), y0 = Math.floor(y), fx = sm(x - x0), fy = sm(y - y0); return lerp(lerp(g(x0, y0), g(x0 + 1, y0), fx), lerp(g(x0, y0 + 1), g(x0 + 1, y0 + 1), fx), fy); };
}
const fbm = (n, x, y) => 0.6 * n(x, y, 9) + 0.3 * n(x, y, 4.5) + 0.1 * n(x, y, 2.2);
const quantile = (arr, q) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

/** Costo (indicativo) per tracciare una strada attraverso un terreno. */
const ROAD_COST = { P: 1, S: 0.5, B: 2, C: 1.5, L: 3, F: 2, M: 7 };

/**
 * Genera una mappa del mondo.
 * Restituisce { name, cols, rows, cells, meta, places } dove places = [{ tipo: 'paese'|'dungeon', col, row, order }]
 * (i dungeon sono ordinati dal più vicino al paese di partenza al più lontano).
 */
export function generateWorld({ cols = 40, rows = 28, towns = 3, dungeons = 6, oases = 2 } = {}) {
  const nh = makeNoise(), nm = makeNoise();
  const H = [], Mo = [];
  for (let r = 0; r < rows; r++) { H.push([]); Mo.push([]); for (let c = 0; c < cols; c++) { H[r].push(fbm(nh, c, r * 1.15)); Mo[r].push(fbm(nm, c + 40, r * 1.15 + 40)); } }
  const flat = a => a.flat();
  const hM = quantile(flat(H), 0.88), hC = quantile(flat(H), 0.72), mB = quantile(flat(Mo), 0.66), mL = quantile(flat(Mo), 0.82), hL = quantile(flat(H), 0.35);
  const T = Array.from({ length: rows }, () => Array(cols).fill('P'));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const h = H[r][c], m = Mo[r][c];
    T[r][c] = h >= hM ? 'M' : h >= hC ? 'C' : (m >= mL && h <= hL) ? 'L' : m >= mB ? 'B' : 'P';
  }
  // fiumi: dalle alture verso il basso
  const nRivers = cols > 45 ? 3 : 2;
  for (let i = 0; i < nRivers; i++) {
    const starts = []; for (let r = 3; r < rows - 3; r++) for (let c = 3; c < cols - 3; c++) if (T[r][c] === 'M' || T[r][c] === 'C') starts.push({ col: c, row: r });
    if (!starts.length) break; let p = pick(starts); const seen = new Set();
    for (let s = 0; s < 70; s++) {
      seen.add(key(p.col, p.row)); if (T[p.row][p.col] !== 'M') T[p.row][p.col] = 'F';
      const nb = neighbors(p.col, p.row).filter(n => n.col > 0 && n.row > 0 && n.col < cols - 1 && n.row < rows - 1 && !seen.has(key(n.col, n.row)));
      if (!nb.length) break; nb.sort((a, b) => H[a.row][a.col] - H[b.row][b.col] + (Math.random() - 0.5) * 0.04);
      if (H[nb[0].row][nb[0].col] > H[p.row][p.col] + 0.06 && s > 8) break; p = nb[0];
    }
  }
  // bordo invalicabile
  for (let c = 0; c < cols; c++) { T[0][c] = 'M'; T[rows - 1][c] = 'M'; }
  for (let r = 0; r < rows; r++) { T[r][0] = 'M'; T[r][cols - 1] = 'M'; }

  // luoghi
  const land = []; for (let r = 3; r < rows - 3; r++) for (let c = 3; c < cols - 3; c++) if (!'MF'.includes(T[r][c])) land.push({ col: c, row: r });
  const places = [];
  const take = (cands, minD) => { for (const h of shuffle([...cands])) if (places.every(p => dist(p, h) >= minD)) { return h; } return null; };
  const west = land.filter(h => h.col < cols * 0.34 && 'PS'.includes(T[h.row][h.col]));
  const startPick = take(west.length ? west : land, 1) || land[0];
  places.push({ tipo: 'paese', col: startPick.col, row: startPick.row, order: 0 }); T[startPick.row][startPick.col] = 'P';
  for (let i = 1; i < towns; i++) { let h = null; for (let d = 9; d >= 4 && !h; d--) h = take(land.filter(x => 'PCB'.includes(T[x.row][x.col])), d); if (h) { places.push({ tipo: 'paese', col: h.col, row: h.row, order: i }); T[h.row][h.col] = 'P'; } }
  const dg = [];
  for (let i = 0; i < dungeons; i++) { let h = null; for (let d = 8; d >= 3 && !h; d--) h = take(land, d); if (h) { dg.push({ tipo: 'dungeon', col: h.col, row: h.row }); places.push(dg[dg.length - 1]); if (!'C'.includes(T[h.row][h.col])) T[h.row][h.col] = 'C'; } }
  const s0 = places[0]; dg.sort((a, b) => dist(a, s0) - dist(b, s0)).forEach((p, i) => { p.order = i; });

  // strade: albero di copertura minimo tra i luoghi
  const idx = places.map((_, i) => i); const joined = new Set([0]); const edges = [];
  while (joined.size < places.length) { let best = null; for (const a of joined) for (const b of idx) if (!joined.has(b)) { const d = dist(places[a], places[b]); if (!best || d < best.d) best = { a, b, d }; } joined.add(best.b); edges.push(best); }
  const isPlace = new Set(places.map(p => key(p.col, p.row)));
  for (const { a, b } of edges) for (const h of roadPath(T, cols, rows, places[a], places[b])) if (!isPlace.has(key(h.col, h.row))) T[h.row][h.col] = 'S';

  // oasi: piccoli luoghi di riposo vicino alle strade, lontani dagli altri luoghi
  const roads = []; for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) if (T[r][c] === 'S') roads.push({ col: c, row: r });
  const nearRoad = land.filter(h => 'PCB'.includes(T[h.row][h.col]) && roads.some(rd => dist(rd, h) <= 3 && dist(rd, h) >= 1));
  for (let i = 0; i < oases; i++) { let h = null; for (let d = 6; d >= 3 && !h; d--) h = take(nearRoad.length ? nearRoad : land, d); if (h) { places.push({ tipo: 'oasi', col: h.col, row: h.row, order: i }); T[h.row][h.col] = 'P'; } }

  const cells = {}; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const cell = TERRAIN[T[r][c]].cell; if (cell) cells[key(c, r)] = cell; }
  const startHex = freeNear(cells, cols, rows, places[0], new Set([key(places[0].col, places[0].row)]), 1)[0] || { col: places[0].col, row: places[0].row };
  return { name: 'Mappa del mondo', cols, rows, cells, meta: { world: true, theme: 'mondo', luce: 'piena', props: [], terrain: T.map(row => row.join('')), start: startHex }, places };
}

/** Percorso di costo minimo (Dijkstra) fra due esagoni, attraversando anche le montagne se serve. */
function roadPath(T, cols, rows, a, b) {
  const dist2 = new Map([[key(a.col, a.row), 0]]); const prev = new Map(); const open = [{ ...a, d: 0 }]; const done = new Set();
  while (open.length) {
    open.sort((x, y) => x.d - y.d); const cur = open.shift(); const k = key(cur.col, cur.row); if (done.has(k)) continue; done.add(k);
    if (cur.col === b.col && cur.row === b.row) break;
    for (const n of neighbors(cur.col, cur.row)) {
      if (n.col < 1 || n.row < 1 || n.col >= cols - 1 || n.row >= rows - 1) continue;
      const nk = key(n.col, n.row); const nd = cur.d + ROAD_COST[T[n.row][n.col]];
      if (nd < (dist2.get(nk) ?? Infinity)) { dist2.set(nk, nd); prev.set(nk, cur); open.push({ ...n, d: nd }); }
    }
  }
  const path = []; let k = key(b.col, b.row), c = { col: b.col, row: b.row };
  while (prev.has(k)) { path.push(c); c = prev.get(k); k = key(c.col, c.row); }
  return path;
}

/** Esagoni liberi (non invalicabili, non occupati) vicini a un punto, dal più vicino in poi. */
export function freeNear(cells, cols, rows, from, taken = new Set(), n = 6) {
  const out = []; const seen = new Set([key(from.col, from.row)]); const q = [{ col: from.col, row: from.row }];
  while (q.length && out.length < n) {
    const cur = q.shift();
    for (const nb of neighbors(cur.col, cur.row)) {
      const k = key(nb.col, nb.row); if (seen.has(k) || nb.col < 0 || nb.row < 0 || nb.col >= cols || nb.row >= rows) continue; seen.add(k); q.push(nb);
      if (cells[k] !== 'w' && !taken.has(k) && out.length < n) out.push(nb);
    }
  }
  return out;
}

/* ---------- paese ---------- */
const NPC_NAMES = {
  locanda: ['Oste Bruno', 'Locandiera Marta', 'Oste Gianni', 'Locandiera Elsa'],
  negozio: ['Mercante Aldo', 'Mercante Lina', 'Bottegaio Teo', 'Mercante Rosa'],
  voci: ['Vecchio Piero', 'Cantastorie Lia', 'Contadina Gina', 'Cacciatore Nando'],
};
export const NPC_ROLE = { locanda: 'Locanda', negozio: 'Negozio', voci: 'Voci e incarichi' };

/** Piazza di un paese: una stanza piccola con locanda, negozio e un abitante che sa le voci. */
export function generateTown({ nome = townName() } = {}) {
  const cols = 15, rows = 11; const cells = {};
  for (let c = 0; c < cols; c++) { cells[key(c, 0)] = 'w'; cells[key(c, rows - 1)] = 'w'; }
  for (let r = 0; r < rows; r++) { cells[key(0, r)] = 'w'; cells[key(cols - 1, r)] = 'w'; }
  const mid = Math.floor(rows / 2); delete cells[key(0, mid)];
  // case: piccoli blocchi di muro lontano dal passaggio centrale
  const houses = [[3, 2], [4, 2], [3, 3], [10, 2], [11, 2], [10, 3], [3, 8], [4, 8], [10, 8], [11, 8], [11, 7]];
  houses.forEach(([c, r]) => { cells[key(c, r)] = 'w'; });
  const npcs = [
    { role: 'locanda', name: pick(NPC_NAMES.locanda), col: 12, row: 4 },
    { role: 'negozio', name: pick(NPC_NAMES.negozio), col: 12, row: 6 },
    { role: 'voci', name: pick(NPC_NAMES.voci), col: 7, row: mid - 1 },
  ];
  const meta = { start: { col: 1, row: mid }, entrance: { col: 0, row: mid }, theme: 'paese', luce: 'piena', props: [], town: true, nome };
  return { name: nome, cols, rows, cells, meta, npcs };
}

/* ---------- incontri durante il viaggio ---------- */
export const FREQ = { rare: -1, normali: 0, frequenti: 1 };

/** Soglia del d20 (incontro se il tiro è ≤ soglia) per un esagono; 0 se non possono esserci incontri. */
export function encounterThreshold(room, hex, places, freq = 'normali') {
  if (places.some(p => (p.tipo === 'paese' || p.tipo === 'oasi') && dist(p, hex) <= 2)) return 0;
  const base = TERRAIN[terrainAt(room, hex.col, hex.row)]?.enc || 0; if (!base) return 0;
  return Math.max(0, base + (FREQ[freq] ?? 0));
}

/** Una "tappa" vale circa 4 punti di movimento. Restituisce true se esce un incontro (tira un d20 per tappa). */
export function rollEncounter(room, hex, cost, places, freq) {
  const thr = encounterThreshold(room, hex, places, freq); if (!thr) return false;
  for (let i = 0, n = Math.max(1, Math.round(cost / 4)); i < n; i++) if (rollDie(20) <= thr) return true;
  return false;
}
