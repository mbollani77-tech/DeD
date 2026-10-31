// Miniature delle stanze e pianta dell'intero dungeon (usate da minimappa e mappa grande).
import { SQ3, center, key } from './hex.js';
import { esc } from './ui.js';
import { THEMES, PROPS } from './props.js';

export const SIZE = 24;
export const hexPts = (cx, cy, s, rot = 0) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 180 * (60 * i - 30 + rot); return `${(cx + s * Math.cos(a)).toFixed(1)},${(cy + s * Math.sin(a)).toFixed(1)}`; }).join(' ');
export const themeOf = room => THEMES[room.meta?.theme] || THEMES.cripta;
export const fullBox = room => ({ x: -SQ3 * SIZE * 0.5 - SIZE * 0.5, y: -SIZE * 1.5, w: SQ3 * SIZE * (room.cols + 0.5) + SIZE, h: SIZE * (1.5 * (room.rows - 1) + 2) + SIZE });

const ids = new WeakMap(); let idSeq = 0;
const objId = o => { if (!o || typeof o !== 'object') return '0'; if (!ids.has(o)) ids.set(o, ++idSeq); return ids.get(o); };
const thumbCache = new WeakMap();
const hexPath = (cx, cy, s) => { let p = ''; for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); p += (i ? 'L' : 'M') + Math.round(cx + s * Math.cos(a)) + ' ' + Math.round(cy + s * Math.sin(a)); } return p + 'Z'; };

/** Miniatura statica di una stanza: un solo tracciato per tipo di terreno, con cache (cambia solo se cambia la stanza). */
export function roomThumb(room, { pad = 6 } = {}) {
  const props = room.meta?.props, theme = room.meta?.theme; const c = thumbCache.get(room.cells);
  if (c && c.props === props && c.theme === theme && c.cols === room.cols && c.rows === room.rows && c.pad === pad) return c.out;
  const T = themeOf(room); const b = fullBox(room); const parts = { f: '', w: '', d: '', a: '' };
  for (let r = 0; r < room.rows; r++) for (let q = 0; q < room.cols; q++) { const t = room.cells[key(q, r)] || 'f'; if (t === 'x') continue; const [cx, cy] = center(q, r, SIZE); parts[t] += hexPath(cx, cy, SIZE + 1); }
  const path = (d, fill) => (d ? `<path d="${d}" fill="${fill}" stroke="${fill}" stroke-width="1"/>` : '');
  let s = `<rect x="${b.x - 99}" y="${b.y - 99}" width="${b.w + 198}" height="${b.h + 198}" fill="${T.bg}"/>` + path(parts.w, T.wallTop) + path(parts.f, T.floor[0]) + path(parts.d, T.diff) + path(parts.a, T.water);
  for (const p of props || []) if (PROPS[p.t]?.luce) { const [cx, cy] = center(p.c, p.r, SIZE); s += `<circle cx="${Math.round(cx)}" cy="${Math.round(cy)}" r="7" fill="#ffb347"/>`; }
  const out = { svg: s, viewBox: `${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}` };
  thumbCache.set(room.cells, { props, theme, cols: room.cols, rows: room.rows, pad, out }); return out;
}
export const dots = (tokens, r = SIZE * 0.85) => tokens.map(t => { const [cx, cy] = center(t.col, t.row, SIZE); return `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r}" fill="${t.color}" stroke="#fff" stroke-width="${r / 4}"/>`; }).join('');

/** Posizioni delle stanze: sul reticolo salvato (meta.map) se c'è per tutte, altrimenti per livelli di distanza. */
export function dungeonLayout(rooms, adj, ids, { W, H, GX, GY }) {
  const pos = new Map();
  if (ids.every(id => rooms.get(id)?.meta?.map)) {
    const xs = ids.map(id => rooms.get(id).meta.map.x), ys = ids.map(id => rooms.get(id).meta.map.y); const x0 = Math.min(...xs), y0 = Math.min(...ys);
    ids.forEach(id => { const m = rooms.get(id).meta.map; pos.set(id, { x: (m.x - x0) * (W + GX), y: (m.y - y0) * (H + GY) }); });
    return pos;
  }
  const placed = new Set(); let yBase = 0;
  for (const start of ids) {
    if (placed.has(start)) continue; const layers = []; let frontier = [start]; placed.add(start);
    while (frontier.length) { layers.push(frontier); const next = []; frontier.forEach(id => [...(adj.get(id) || [])].filter(n => ids.includes(n) && !placed.has(n)).forEach(n => { placed.add(n); next.push(n); })); frontier = next; }
    const tall = Math.max(...layers.map(l => l.length));
    layers.forEach((l, x) => l.forEach((id, y) => pos.set(id, { x: x * (W + GX), y: yBase + (y + (tall - l.length) / 2) * (H + GY) })));
    yBase += tall * (H + GY) + 20;
  }
  return pos;
}

let memo = { sig: '', out: null };
/**
 * Pianta del dungeon. Il Master vede tutto; i giocatori solo le stanze visitate e un "?" per quelle vicine.
 * compact = versione per la minimappa. Con molte stanze la minimappa diventa "semplice" (blocchi colorati)
 * e viene ridisegnata solo quando cambia davvero qualcosa (non a ogni passo dei personaggi).
 */
export function dungeonSvg(store, { role = 'player', currentRoomId = null, compact = false } = {}) {
  const master = role === 'master';
  const rooms = [...store.rooms].sort((a, b) => a.sort - b.sort); const byId = new Map(rooms.map(r => [r.id, r]));
  if (!rooms.length) return { inner: '', viewBox: '0 0 10 10', empty: true };
  const doors = store.entities.filter(e => e.kind === 'door' && e.data.target_room && byId.has(e.data.target_room) && byId.has(e.room_id));
  const adj = new Map(rooms.map(r => [r.id, new Set()])); const lockedPair = new Set();
  doors.forEach(d => { adj.get(d.room_id).add(d.data.target_room); adj.get(d.data.target_room).add(d.room_id); if (d.data.locked) lockedPair.add([d.room_id, d.data.target_room].sort().join('|')); });
  const visited = new Set(store.campaign.state?.visited || []); if (currentRoomId) visited.add(currentRoomId); store.characters.forEach(c => c.room_id && visited.add(c.room_id));
  const shown = master ? new Set(rooms.map(r => r.id)) : new Set([...visited].filter(id => byId.has(id)));
  const unknown = new Set(); // ai giocatori non si mostra nulla delle stanze non visitate: né il nome, né la forma, né un segnaposto
  const ids = rooms.map(r => r.id).filter(id => shown.has(id) || unknown.has(id));
  const simple = compact && ids.length > 24; // conta solo le stanze che chi guarda può vedere
  const sizes = simple ? { W: 60, H: 44, GX: 14, GY: 12 } : compact ? { W: 92, H: 70, GX: 22, GY: 20 } : { W: 190, H: 140, GX: 70, GY: 60 };
  const pcCount = new Map(); store.characters.forEach(c => pcCount.set(c.room_id, (pcCount.get(c.room_id) || 0) + 1));
  if (compact) {
    const sig = [role, simple, currentRoomId, ids.map(id => { const r = byId.get(id); return `${id}:${pcCount.get(id) || 0}${unknown.has(id) ? '?' : ''}${objId(r.cells)}.${objId(r.meta?.props)}${r.meta?.theme || ''}${r.meta?.map ? r.meta.map.x + ',' + r.meta.map.y : ''}`; }).join(';'), [...lockedPair].join(','), doors.length].join('|');
    if (memo.sig === sig) return memo.out; memo.pending = sig;
  }
  const { W, H, GX, GY } = sizes; const pos = dungeonLayout(byId, adj, ids, sizes);
  const maxX = Math.max(...[...pos.values()].map(p => p.x)) + W, maxY = Math.max(...[...pos.values()].map(p => p.y)) + H + (compact ? 0 : 34);
  const k = simple ? Math.max(1, Math.max(maxX, maxY) / 230) : 1; // spessori che restano leggibili quando la pianta è molto grande
  const seen = new Set(); let edges = '', cards = '';
  doors.forEach(d => {
    const a = d.room_id, b = d.data.target_room; const kk = [a, b].sort().join('|'); if (seen.has(kk) || !pos.has(a) || !pos.has(b)) return; seen.add(kk);
    const pa = pos.get(a), pb = pos.get(b); const x1 = pa.x + W / 2, y1 = pa.y + H / 2, x2 = pb.x + W / 2, y2 = pb.y + H / 2; const locked = lockedPair.has(kk);
    edges += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${locked ? '#ae3f3a' : '#9bb3aa'}" stroke-width="${(compact ? 7 : 6) * (simple ? k * 0.7 : 1)}" ${locked ? `stroke-dasharray="${compact ? 9 * k : 10} ${7 * k}"` : ''} stroke-linecap="round"/>`;
    if (!compact) edges += `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2}" font-size="26" text-anchor="middle" dominant-baseline="central" paint-order="stroke" stroke="#0f161b" stroke-width="6">${locked ? '🔒' : '🚪'}</text>`;
  });
  ids.forEach(id => {
    const r = byId.get(id), p = pos.get(id), here = id === currentRoomId; const pcs = store.characters.filter(c => c.room_id === id);
    if (unknown.has(id)) { cards += `<g transform="translate(${p.x},${p.y})"><rect width="${W}" height="${H}" rx="${compact ? 8 : 12}" fill="#1a232a" stroke="#4a5964" stroke-width="${3 * (simple ? k * 0.6 : 1)}" stroke-dasharray="8 6"/>${simple ? '' : `<text x="${W / 2}" y="${H / 2}" font-size="${compact ? 34 : 54}" fill="#6b7a85" text-anchor="middle" dominant-baseline="central">?</text>`}</g>`; return; }
    if (simple) {
      const T = themeOf(r);
      cards += `<g transform="translate(${p.x},${p.y})"><rect width="${W}" height="${H}" rx="${4 * k * 0.6}" fill="${T.floor[0]}" stroke="${here ? '#e0a233' : T.wall}" stroke-width="${here ? 8 * k : 3 * k * 0.6}"/>${pcs.length ? `<circle cx="${W / 2}" cy="${H / 2}" r="${15 * k * 0.8}" fill="#277a73" stroke="#fff" stroke-width="${3 * k * 0.6}"/>` : ''}</g>`; return;
    }
    const th = roomThumb(r); const tokens = pcs.map(c => ({ col: c.col, row: c.row, color: '#277a73' }));
    if (master && !compact) store.entities.forEach(e => { if (e.room_id === id && e.kind === 'monster' && !e.data.dead) tokens.push({ col: e.col, row: e.row, color: '#ae3f3a' }); });
    const pad = compact ? 3 : 6; const tip = `<title>${esc(r.name)}</title>`;
    cards += `<g transform="translate(${p.x},${p.y})" data-room="${id}" data-name="${esc(r.name.toLowerCase())}" class="dm-card ${master ? 'click' : ''}">${tip}<rect width="${W}" height="${H}" rx="${compact ? 8 : 12}" fill="#0f161b" stroke="${here ? '#e0a233' : '#4a5964'}" stroke-width="${here ? (compact ? 6 : 5) : 2}"/>
      <svg x="${pad}" y="${pad}" width="${W - pad * 2}" height="${H - pad * 2}" viewBox="${th.viewBox}" preserveAspectRatio="xMidYMid slice" style="border-radius:6px">${th.svg}${dots(tokens, compact ? SIZE * 1.3 : SIZE * 0.85)}</svg>
      ${compact ? '' : `<text x="${W / 2}" y="${H + 22}" font-size="17" fill="#e8efec" text-anchor="middle" font-family="Source Sans 3, system-ui, sans-serif" font-weight="600">${esc(r.name)}</text>`}
      ${!compact && pcs.length ? `<g transform="translate(${W - 46},12)"><rect width="38" height="24" rx="12" fill="#277a73" stroke="#fff" stroke-width="2"/><text x="19" y="13" font-size="14" fill="#fff" font-weight="700" text-anchor="middle" dominant-baseline="central">${pcs.length} PG</text></g>` : ''}</g>`;
  });
  const m = compact ? 10 : 14;
  const out = { inner: edges + cards, viewBox: `${-m} ${-m} ${maxX + m * 2} ${maxY + m * 2}`, w: maxX, h: maxY, count: ids.length };
  if (compact) memo = { sig: memo.pending, out };
  return out;
}
