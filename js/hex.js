// Griglia a esagoni "pointy-top", righe dispari spostate a destra (odd-r).
// 1 esagono = 5 piedi.
export const SQ3 = Math.sqrt(3);
export const key = (c, r) => c + ',' + r;
export const center = (col, row, size = 24) => [size * SQ3 * (col + 0.5 * (row & 1)), size * 1.5 * row];

export function toCube(col, row) { const x = col - (row - (row & 1)) / 2; return { x, y: -x - row, z: row }; }
export function dist(a, b) {
  const A = toCube(a.col, a.row), B = toCube(b.col, b.row);
  return Math.max(Math.abs(A.x - B.x), Math.abs(A.y - B.y), Math.abs(A.z - B.z));
}
const EVEN = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
const ODD = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];
export const neighbors = (col, row) => ((row & 1) ? ODD : EVEN).map(([dc, dr]) => ({ col: col + dc, row: row + dr }));
export const inBounds = (room, { col, row }) => col >= 0 && row >= 0 && col < room.cols && row < room.rows;

/** Costo di ingresso: muro = impossibile, difficile/acqua = 2. */
export const terrainCost = t => (t === 'w' ? Infinity : (t === 'd' || t === 'a') ? 2 : 1);

/** Esagoni raggiungibili entro `budget`, evitando `blocked` (Set di chiavi). Map chiave → costo. */
export function reachable(room, start, budget, blocked = new Set()) {
  const sk = key(start.col, start.row);
  const best = new Map([[sk, 0]]);
  const frontier = [{ col: start.col, row: start.row, c: 0 }];
  while (frontier.length) {
    frontier.sort((a, b) => a.c - b.c);
    const cur = frontier.shift();
    if (cur.c > best.get(key(cur.col, cur.row))) continue;
    for (const n of neighbors(cur.col, cur.row)) {
      if (!inBounds(room, n)) continue;
      const k = key(n.col, n.row);
      if (blocked.has(k)) continue;
      const cost = terrainCost(room.cells[k]);
      if (!isFinite(cost)) continue;
      const nc = cur.c + cost;
      if (nc > budget) continue;
      if (nc < (best.get(k) ?? Infinity)) { best.set(k, nc); frontier.push({ col: n.col, row: n.row, c: nc }); }
    }
  }
  best.delete(sk);
  return best;
}

export function hexesWithin(room, c, radius) {
  const out = [];
  for (let r = 0; r < room.rows; r++) for (let q = 0; q < room.cols; q++) if (dist(c, { col: q, row: r }) <= radius) out.push({ col: q, row: r });
  return out;
}

function cubeRound(x, y, z) {
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  return { x: rx, y: ry, z: rz };
}
/** Linea di vista: nessun muro negli esagoni intermedi. */
export function los(room, a, b) {
  const A = toCube(a.col, a.row), B = toCube(b.col, b.row); const n = dist(a, b);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const p = cubeRound(A.x + (B.x - A.x) * t + 1e-6, A.y + (B.y - A.y) * t + 2e-6, A.z + (B.z - A.z) * t - 3e-6);
    const col = p.x + (p.z - (p.z & 1)) / 2;
    if (room.cells[key(col, p.z)] === 'w') return false;
  }
  return true;
}
