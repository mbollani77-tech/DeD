// Mappa a nido d'ape (SVG): temi, arredi, luci, minimappa, zoom e trascinamento.
import { SQ3, center, key } from './hex.js';
import { esc } from './ui.js';
import { THEMES, PROPS, propSvg, hash } from './props.js';
import { TERRAIN, terrainAt } from './world.js';
import { statiIcons } from './status.js';

export const SIZE = 24;
const hexPts = (cx, cy, s, rot = 0) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 180 * (60 * i - 30 + rot); return `${(cx + s * Math.cos(a)).toFixed(1)},${(cy + s * Math.sin(a)).toFixed(1)}`; }).join(' ');
const initials = n => esc(String(n).replace(/\s+\d+$/, '').slice(0, 2));
const num = n => (String(n).match(/\s(\d+)$/) || [])[1] || '';
export const themeOf = room => THEMES[room.meta?.theme] || THEMES.cripta;
export const fullBox = room => ({ x: -SQ3 * SIZE * 0.5 - SIZE * 0.5, y: -SIZE * 1.5, w: SQ3 * SIZE * (room.cols + 0.5) + SIZE, h: SIZE * (1.5 * (room.rows - 1) + 2) + SIZE });

/** Decorazioni di un singolo esagono (sopra il poligono di base). */
/** Disegno di un esagono della mappa del mondo (alberi, colline, montagne, onde...). */
function worldArt(code, c, r) {
  const h1 = hash(c, r, 3), h2 = hash(c, r, 4), h3 = hash(c, r, 5);
  if (code === 'B') return [0, 1, 2].map(i => { const x = (hash(c, r, 30 + i) - 0.5) * 20, y = (hash(c, r, 40 + i) - 0.5) * 14; return `<path d="M${x.toFixed(1)} ${(y - 8).toFixed(1)} l-5 10 h10 z" fill="#2f5a2e"/><path d="M${x.toFixed(1)} ${(y - 3).toFixed(1)} l-6 9 h12 z" fill="#3a6c37"/>`; }).join('');
  if (code === 'C') return `<path d="M-12 5 Q-5 -7 2 5 M-3 8 Q5 -3 12 8" stroke="#8d8650" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  if (code === 'M') return `<path d="M-13 10 L-1 -12 L6 -1 L9 -6 L14 10 Z" fill="#7b7e84" stroke="#4d5056" stroke-width="1.2" stroke-linejoin="round"/><path d="M-1 -12 L-5.5 -4 L-2 -5 L0 -2 L3 -5 L6 -1 Z" fill="#f4f7f9"/><path d="M6 -1 L9 -6 L14 10 L4 10 Z" fill="#62666c" opacity=".7"/>`;
  if (code === 'F') return `<path d="M-11 ${-3 + h1 * 3} q3 -3 6 0 t6 0 t6 0 M-9 ${5 - h2 * 3} q3 -3 6 0 t6 0" stroke="#d3e8f7" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".85"/>`;
  if (code === 'L') return `<ellipse cx="${(h1 - 0.5) * 6}" cy="${(h2 - 0.5) * 5}" rx="9" ry="4.5" fill="#4f6e56" opacity=".55"/><path d="M${-7 + h1 * 4} 4 v-8 M${-3 + h2 * 4} 5 v-9 M${3 + h3 * 3} 4 v-7" stroke="#38523d" stroke-width="1.6" stroke-linecap="round"/>`;
  if (code === 'S') return `<circle cx="${(h1 - 0.5) * 12}" cy="${(h2 - 0.5) * 10}" r="2.6" fill="#b9a678" opacity=".8"/><circle cx="${(h2 - 0.5) * 12}" cy="${(h3 - 0.5) * 10}" r="1.8" fill="#b9a678" opacity=".7"/>`;
  return `<path d="M${-8 + h1 * 6} 4 l1.5 -5 M${2 + h2 * 5} -2 l1.5 -5" stroke="#7d9a52" stroke-width="1.4" stroke-linecap="round"/>`;
}
const worldFill = (code, c, r) => TERRAIN[code].color[Math.floor(hash(c, r, 0) * 3)];

function cellArt(T, c, r, t) {
  const h1 = hash(c, r, 3), h2 = hash(c, r, 4), h3 = hash(c, r, 5);
  if (t === 'w') {
    if (T.wallStyle === 'bush') return `<circle cx="${-7 + h1 * 4}" cy="${-4 + h2 * 4}" r="10" fill="${T.wallTop}"/><circle cx="${6 - h2 * 3}" cy="${-2 + h1 * 3}" r="9.5" fill="${T.wall}" stroke="#0004"/><circle cx="${h3 * 6 - 3}" cy="${6 - h1 * 3}" r="9" fill="${T.wallTop}" opacity=".85"/><circle cx="-2" cy="-8" r="2" fill="#ffffff22"/>`;
    if (T.wallStyle === 'rock') {
      const pts = Array.from({ length: 8 }, (_, i) => { const a = Math.PI / 4 * i + hash(c, r, 10 + i) * .5, rr = SIZE - 3 + (hash(c, r, 20 + i) - .5) * 7; return `${(rr * Math.cos(a)).toFixed(1)},${(rr * Math.sin(a) - 1.5).toFixed(1)}`; }).join(' ');
      return `<polygon points="${pts}" fill="${T.wallTop}" stroke="${T.wall}" stroke-width="1.6"/><path d="M-9 -2 L-2 -6 L3 1 M2 -9 L5 -3" stroke="${T.hatch}" stroke-width="1.2" fill="none" opacity=".8"/>`;
    }
    const rot = Math.floor(h1 * 3) * 20;
    return `<polygon points="${hexPts(0, -2.4, SIZE - 3.2)}" fill="${T.wallTop}" stroke="${T.wall}" stroke-width="1.2"/><g stroke="${T.hatch}" stroke-width="1.3" opacity=".6" transform="rotate(${rot})"><path d="M-11 -2 L-3 -11 M-6 4 L5 -8 M0 9 L11 -1"/></g><path d="M-9 -10 L0 -15 L9 -10" stroke="#ffffff30" stroke-width="1.4" fill="none"/>`;
  }
  if (t === 'a') return `<path d="M-12 -4 q3 -3 6 0 t6 0 t6 0 M-10 5 q3 -3 6 0 t6 0" stroke="#ffffff77" stroke-width="1.5" fill="none"/>`;
  if (t === 'd') return `<ellipse cx="-7" cy="3" rx="4.4" ry="3" fill="#00000030"/><ellipse cx="6" cy="-4" rx="3.6" ry="2.6" fill="#00000028"/><ellipse cx="3" cy="8" rx="2.6" ry="1.8" fill="#0000002a"/><ellipse cx="-7.5" cy="2" rx="3.6" ry="2.3" fill="#ffffff22"/>`;
  let s = `<polygon points="${hexPts(0, 0, SIZE - 4)}" fill="none" stroke="${T.edge}" stroke-width="1"/>`;
  if (h1 < 0.2) s += `<path d="M${-8 + h2 * 5} ${-7 + h3 * 4} l4 5 l-2 4 l5 5" stroke="#0000002e" stroke-width="1" fill="none"/>`;
  if (h2 < 0.14) s += `<ellipse cx="${h1 * 12 - 6}" cy="${h3 * 10 - 5}" rx="${5 + h3 * 3}" ry="${3 + h1 * 2}" fill="${T.stain}" opacity=".16"/>`;
  return s;
}

/** Miniatura di una stanza (per minimappa e mappa del dungeon). */
export function roomThumb(room, { tokens = [], pad = 6 } = {}) {
  const T = themeOf(room); const b = fullBox(room); let s = `<rect x="${b.x - 99}" y="${b.y - 99}" width="${b.w + 198}" height="${b.h + 198}" fill="${T.bg}"/>`;
  for (let r = 0; r < room.rows; r++) for (let c = 0; c < room.cols; c++) {
    const t = room.cells[key(c, r)] || 'f'; const [cx, cy] = center(c, r, SIZE);
    const fill = room.meta?.world ? worldFill(terrainAt(room, c, r), c, r) : t === 'w' ? T.wallTop : t === 'a' ? T.water : t === 'd' ? T.diff : T.floor[0];
    s += `<polygon points="${hexPts(cx, cy, SIZE)}" fill="${fill}"/>`;
  }
  for (const p of room.meta?.props || []) { const [cx, cy] = center(p.c, p.r, SIZE); s += `<circle cx="${cx}" cy="${cy}" r="${PROPS[p.t]?.luce ? 7 : 5}" fill="${PROPS[p.t]?.luce ? '#ffb347' : '#00000055'}"/>`; }
  for (const t of tokens) { const [cx, cy] = center(t.col, t.row, SIZE); s += `<circle cx="${cx}" cy="${cy}" r="${SIZE * 0.8}" fill="${t.color}" stroke="#fff" stroke-width="3"/>`; }
  return { svg: s, viewBox: `${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}` };
}

export function createBoard(svg, h = {}) {
  let view = null, fitted = null, d = null, drag = null, moved = false, painting = false, lastPaint = null, theme = THEMES.cripta;
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const wrap = svg.parentElement;
  const mini = document.createElement('div'); mini.className = 'minimap'; mini.innerHTML = '<svg aria-label="Minimappa" preserveAspectRatio="xMidYMid meet"></svg>'; wrap.appendChild(mini);
  const msvg = mini.querySelector('svg'); let mbox = null; let miniOn = localStorage.getItem('dnd.mini') === '1';

  const apply = () => {
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
    mini.hidden = !miniOn; // la minimappa si attiva a richiesta (pulsante)
    const v = msvg.querySelector('#mm-view'); if (v) { v.setAttribute('x', view.x); v.setAttribute('y', view.y); v.setAttribute('width', view.w); v.setAttribute('height', view.h); }
  };
  const fit = () => { if (d) { view = fullBox(d.room); apply(); } };

  function token(t, cx, cy) {
    return `<g class="tok ${t.cls} ${t.ghost ? 'ghost' : ''} ${t.sel ? 'sel' : ''}" data-c="${t.col}" data-r="${t.row}" data-kind="${t.kind}" data-id="${t.id}" transform="translate(${cx.toFixed(1)},${cy.toFixed(1)})"><title>${esc(t.title)}</title>${t.body}${t.turn ? `<circle class="turnring" r="${SIZE * 0.98}"/>` : ''}${t.stati ? `<text class="stico" y="${-SIZE * 0.95}">${t.stati}</text>` : ''}${t.sel ? `<circle class="selring" r="${SIZE * 0.86}"/>` : ''}</g>`;
  }
  const hpBar = (hp, max) => { const w = SIZE * 1.1, p = Math.max(0, Math.min(1, hp / (max || 1))); return `<rect class="hp-bg" x="${-w / 2}" y="${SIZE * 0.62}" width="${w}" height="4" rx="2"/><rect class="hp-fg ${p < 0.34 ? 'low' : p < 0.67 ? 'mid' : ''}" x="${-w / 2}" y="${SIZE * 0.62}" width="${(w * p).toFixed(1)}" height="4" rx="2"/>`; };
  const glyph = (g, y = 0, s = 0.95) => `<text class="glyph" y="${y}" font-size="${SIZE * s}">${g}</text>`;
  const shadow = `<ellipse class="tshadow" cx="1.5" cy="${SIZE * 0.5}" rx="${SIZE * 0.6}" ry="${SIZE * 0.3}"/>`;

  function renderMini() {
    const { room } = d; const tokens = [];
    (d.characters || []).forEach(c => tokens.push({ col: c.col, row: c.row, color: d.meId === c.id ? '#c0862a' : '#277a73' }));
    (d.entities || []).forEach(e => { if (e.kind === 'monster' && !e.data.dead && (!d.visible || d.visible.has(key(e.col, e.row)))) tokens.push({ col: e.col, row: e.row, color: '#ae3f3a' }); });
    const th = roomThumb(room, { tokens }); mbox = th.viewBox; msvg.setAttribute('viewBox', th.viewBox);
    let inner = th.svg;
    if (d.visible) inner += `<g fill="#0e1418">${[...Array(room.rows * room.cols).keys()].map(i => { const c = i % room.cols, r = Math.floor(i / room.cols); if (d.visible.has(key(c, r))) return ''; const [cx, cy] = center(c, r, SIZE); return `<polygon points="${hexPts(cx, cy, SIZE + 0.5)}"/>`; }).join('')}</g>`;
    msvg.innerHTML = inner + `<rect id="mm-view" fill="#ffffff22" stroke="#fff" stroke-width="7" pointer-events="none"/>`;
  }

  function render(data, opts = {}) {
    d = data; const { room } = d; theme = themeOf(room);
    if (!view || fitted !== room.id) { fitted = room.id; fit(); }
    renderMini(); apply();
    if (opts.miniOnly) return;
    const T = theme; const b = fullBox(room); const master = d.role === 'master';
    let html = `<defs><pattern id="hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 0 V9" stroke="${T.hatch}" stroke-width="1.6"/></pattern><pattern id="hatch2" width="13" height="13" patternUnits="userSpaceOnUse" patternTransform="rotate(-55)"><path d="M0 0 V13" stroke="${T.hatch}" stroke-width="1" opacity=".7"/></pattern></defs>`;
    html += `<rect x="${b.x - 600}" y="${b.y - 600}" width="${b.w + 1200}" height="${b.h + 1200}" fill="${T.bg}"/><rect x="${b.x - 600}" y="${b.y - 600}" width="${b.w + 1200}" height="${b.h + 1200}" fill="url(#hatch)" opacity=".75"/><rect x="${b.x - 600}" y="${b.y - 600}" width="${b.w + 1200}" height="${b.h + 1200}" fill="url(#hatch2)" opacity=".5"/>`;
    const art = []; let hexes = '<g class="hexes">'; let hls = '<g class="hls">';
    for (let r = 0; r < room.rows; r++) for (let c = 0; c < room.cols; c++) {
      const k = key(c, r); const hide = d.visible && !d.visible.has(k); const t = room.cells[k] || 'f';
      const [cx, cy] = center(c, r, SIZE);
      const wc = room.meta?.world ? terrainAt(room, c, r) : null;
      const fill = hide ? '#0d1217' : wc ? worldFill(wc, c, r) : t === 'w' ? T.wall : t === 'a' ? T.water : t === 'd' ? T.diff : T.floor[Math.floor(hash(c, r, 0) * 3)];
      hexes += `<polygon class="hx" data-t="${hide ? 'void' : t}" data-c="${c}" data-r="${r}" fill="${fill}" points="${hexPts(cx, cy, SIZE - 0.4)}"/>`;
      if (!hide) art.push(`<g transform="translate(${cx.toFixed(1)},${cy.toFixed(1)})">${wc ? worldArt(wc, c, r) : cellArt(T, c, r, t)}</g>`);
      const hl = !hide && d.hl?.get(k); if (hl) hls += `<polygon class="hlp hl-${hl}" points="${hexPts(cx, cy, SIZE - 1.6)}"/>`;
    }
    hexes += '</g>'; hls += '</g>';
    html += hexes + `<g class="deco">${art.join('')}</g>`;

    // arredi
    const lights = []; let props = '<g class="props">';
    (room.meta?.props || []).forEach(p => {
      const k = key(p.c, p.r); if (d.visible && !d.visible.has(k)) return;
      const [cx, cy] = center(p.c, p.r, SIZE); props += `<g class="prop p-${p.t}" transform="translate(${cx.toFixed(1)},${cy.toFixed(1)})"><title>${esc(PROPS[p.t]?.nome || p.t)}</title>${propSvg(p.t, p.c, p.r)}</g>`;
      if (PROPS[p.t]?.luce) lights.push({ x: cx, y: cy, r: PROPS[p.t].luce });
    });
    html += props + '</g>' + hls;
    if (d.showStart && room.meta?.start) { const [cx, cy] = center(room.meta.start.col, room.meta.start.row, SIZE); html += `<g class="startmark" transform="translate(${cx},${cy})"><path d="M-6,8 L-6,-9 L8,-4 L-6,1" /></g>`; }

    // pedine
    const toks = []; const sel = d.sel;
    (d.characters || []).forEach(c => { if (c.hp > 0) { const [lx, ly] = center(c.col, c.row, SIZE); lights.push({ x: lx, y: ly, r: 6 }); } });
    const luce = room.meta?.luce || 'piena';
    const lit = (col, row) => { const [x, y] = center(col, row, SIZE); return lights.some(l => Math.hypot(l.x - x, l.y - y) < l.r * SQ3 * SIZE * 0.7); };
    (d.entities || []).forEach(e => {
      if (d.visible && !d.visible.has(key(e.col, e.row))) return;
      if (!master && luce === 'buia' && e.kind === 'monster' && !e.data.dead && !lit(e.col, e.row)) return;
      const dd = e.data || {}; const s = sel && sel.kind === 'entity' && sel.id === e.id;
      const base = { id: e.id, col: e.col, row: e.row, ghost: master && e.hidden, sel: s, turn: d.turnId === e.id && !dd.dead, stati: e.kind === 'monster' && !dd.dead ? statiIcons(e) : '', title: e.name + (e.hidden ? ' (nascosto)' : '') };
      if (e.kind === 'door' && dd.place) toks.push({ ...base, z: 1, kind: 'entity', cls: 'place' + (dd.waiting ? ' off' : ''), title: e.name + (e.hidden ? ' (non ancora scoperto)' : '') + (dd.waiting ? ' — dormiente fino a quando finirete un altro dungeon' : ''), body: `<circle class="pbase" r="${SIZE * 0.82}"/>${glyph(dd.icon || (dd.place === 'paese' ? '🏘️' : '🏰'), 0, 1.05)}${dd.waiting ? glyph('🔒', SIZE * 0.5, 0.7) : ''}<text class="plabel" y="${SIZE * 1.32}">${esc(e.name)}</text>` });
      else if (e.kind === 'npc') toks.push({ ...base, z: 2, kind: 'entity', cls: 'npc', title: `${e.name} — ${({ locanda: 'Locanda', negozio: 'Negozio', voci: 'Voci e incarichi', prigioniero: 'Prigioniero: puoi convincerlo a unirsi', viandante: 'Viandante: puoi convincerlo a unirsi' })[dd.role] || ''}`, body: `${shadow}<circle r="${SIZE * 0.62}"/><circle r="${SIZE * 0.45}" class="inner"/><text class="ini" y="1">${initials(e.name)}</text>${glyph(({ locanda: '🍺', negozio: '💰', voci: '💬', prigioniero: '⛓️', viandante: '🎒' })[dd.role] || '', -SIZE * 0.75, 0.5)}` });
      else if (e.kind === 'door') toks.push({ ...base, z: 0, kind: 'entity', cls: 'door', body: `<path d="M-11 12 V-6 Q-11 -14 0 -14 Q11 -14 11 -6 V12 Z" fill="${dd.locked ? '#6b3a2a' : '#8a5f34'}" stroke="#2c1a0e" stroke-width="1.8"/><path d="M0 -14 V12 M-11 -2 H11" stroke="#2c1a0e" stroke-width="1" opacity=".6"/><circle cx="5" cy="2" r="1.6" fill="#e5c76a"/>${dd.locked ? `<rect x="-4.5" y="-2" width="9" height="8" rx="1.5" fill="#d9b43f" stroke="#5a4210"/><path d="M-2.5 -2 V-5 a2.5 2.5 0 0 1 5 0 V-2" fill="none" stroke="#5a4210" stroke-width="1.6"/>` : ''}` });
      else if (e.kind === 'trap') toks.push({ ...base, z: 1, kind: 'entity', cls: 'trap' + (dd.armed === false ? ' off' : ''), body: dd.armed === false ? glyph('✖', 0, 0.8) : `<polygon points="0,-13 13,10 -13,10" fill="#e5a02e" stroke="#5a3a07" stroke-width="1.8"/><path d="M0 -5 V3" stroke="#3a2400" stroke-width="2.4"/><circle cy="7" r="1.5" fill="#3a2400"/>` });
      else if (e.kind === 'treasure') toks.push({ ...base, z: 1, kind: 'entity', cls: 'treasure' + (dd.looted ? ' off' : '') + (dd.locked ? ' locked' : ''), body: `${shadow}<rect x="-11" y="-5" width="22" height="14" rx="2" fill="${dd.looted ? '#6e5a3a' : '#9a6a2f'}" stroke="#3c2410" stroke-width="1.6"/><path d="M-11 -5 Q0 -15 11 -5 Z" fill="${dd.looted ? '#7d6844' : '#b98238'}" stroke="#3c2410" stroke-width="1.6"/><rect x="-2" y="-3" width="4" height="6" fill="${dd.looted ? '#8a8a8a' : '#e5c76a'}" stroke="#3c2410"/>` });
      else if (e.kind === 'monster') {
        if (dd.dead) toks.push({ ...base, z: 1, kind: 'entity', cls: 'monster dead', title: e.name + ' (sconfitto)', body: glyph('☠️', 0, 0.85) });
        else toks.push({ ...base, z: 2, kind: 'entity', cls: 'monster', body: `${shadow}<circle r="${SIZE * 0.68}"/><circle r="${SIZE * 0.5}" class="inner"/><text class="ini" y="1">${initials(e.name)}</text>${num(e.name) ? `<text class="tag" x="${SIZE * 0.5}" y="${-SIZE * 0.42}">${num(e.name)}</text>` : ''}${hpBar(dd.hp, dd.maxHp)}` });
      }
    });
    (d.characters || []).forEach(c => {
      const s = sel && sel.kind === 'char' && sel.id === c.id; const me = d.meId === c.id;
      toks.push({ id: c.id, col: c.col, row: c.row, z: 3, kind: 'pc', sel: s, turn: d.turnId === c.id && c.hp > 0, stati: c.hp > 0 ? statiIcons(c) : '', title: `${c.name} (${c.hp}/${c.max_hp} PF)`, cls: 'pc' + (me ? ' me' : '') + (c.data?.companion ? ' comp' : '') + (c.hp <= 0 ? ' down' : ''), body: `${shadow}<circle r="${SIZE * 0.68}"/><circle r="${SIZE * 0.5}" class="inner"/><text class="ini" y="1">${initials(c.name)}</text>${hpBar(c.hp, c.max_hp)}` });
    });
    html += '<g class="tokens">' + toks.sort((a, b) => a.z - b.z).map(t => { const [cx, cy] = center(t.col, t.row, SIZE); return token(t, cx, cy); }).join('') + '</g>';

    // illuminazione: ai giocatori mostra il buio, al Master tutto chiaro
    if (!master && luce !== 'piena') {
      const dark = luce === 'buia' ? 0.82 : 0.55; const big = { x: b.x - 600, y: b.y - 600, w: b.w + 1200, h: b.h + 1200 };
      html += `<defs><radialGradient id="lg"><stop offset="0" stop-color="#000" stop-opacity="1"/><stop offset=".55" stop-color="#000" stop-opacity=".92"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><mask id="lm" maskUnits="userSpaceOnUse" x="${big.x}" y="${big.y}" width="${big.w}" height="${big.h}"><rect x="${big.x}" y="${big.y}" width="${big.w}" height="${big.h}" fill="#fff"/>${lights.map(l => `<circle cx="${l.x.toFixed(1)}" cy="${l.y.toFixed(1)}" r="${(l.r * SQ3 * SIZE * 0.85).toFixed(0)}" fill="url(#lg)"/>`).join('')}</mask></defs><rect class="dark" x="${big.x}" y="${big.y}" width="${big.w}" height="${big.h}" fill="#04070b" opacity="${dark}" mask="url(#lm)"/>`;
    }
    svg.innerHTML = html;
    svg.classList.toggle('painting', !!d.paint);
  }

  const stackAt = (c, r) => [...svg.querySelectorAll(`.tok[data-c="${c}"][data-r="${r}"]`)].reverse().map(el => ({ kind: el.dataset.kind, id: el.dataset.id }));
  const hexOf = el => { const n = el?.closest?.('[data-c]'); return n && svg.contains(n) ? { col: +n.dataset.c, row: +n.dataset.r } : null; };
  const scale = () => { const r = svg.getBoundingClientRect(); return Math.max(view.w / r.width, view.h / r.height) || 1; };

  function paintAt(hex) { const k = key(hex.col, hex.row); if (k === lastPaint) return; lastPaint = k; h.onPaint?.(hex.col, hex.row); }
  svg.addEventListener('pointerdown', e => {
    if (!view || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const hx = hexOf(e.target);
    if (d?.paint && hx) { painting = true; lastPaint = null; paintAt(hx); return; }
    drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; moved = false;
  });
  svg.addEventListener('pointermove', e => {
    if (painting) { const hx = hexOf(document.elementFromPoint(e.clientX, e.clientY)); if (hx) paintAt(hx); return; }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!moved && Math.hypot(dx, dy) < 6) return;
    moved = true; const s = scale(); view.x = drag.vx - dx * s; view.y = drag.vy - dy * s; apply();
  });
  const up = e => {
    if (painting) { painting = false; lastPaint = null; h.onPaintEnd?.(); return; }
    if (drag && !moved && e.type === 'pointerup') { const hx = hexOf(e.target); if (hx) h.onClick?.({ ...hx, stack: stackAt(hx.col, hx.row) }); }
    drag = null;
  };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  svg.addEventListener('pointerleave', () => { if (painting) { painting = false; h.onPaintEnd?.(); } });

  function zoom(f, fx = 0.5, fy = 0.5) {
    if (!view || !d) return; const b = fullBox(d.room);
    const nw = Math.min(b.w * 2, Math.max(b.w * 0.2, view.w * f)); const k = nw / view.w;
    view.x += (view.w - view.w * k) * fx; view.y += (view.h - view.h * k) * fy; view.w *= k; view.h *= k; apply();
  }
  svg.addEventListener('wheel', e => {
    e.preventDefault(); const r = svg.getBoundingClientRect();
    zoom(e.deltaY < 0 ? 0.87 : 1.15, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  }, { passive: false });

  /** Centra la vista su un punto (coordinate in unità SVG). */
  function panToXY(x, y) { if (!view) return; view.x = x - view.w / 2; view.y = y - view.h / 2; apply(); }
  const miniPoint = e => { const r = msvg.getBoundingClientRect(); const [vx, vy, vw, vh] = (mbox || '0 0 1 1').split(' ').map(Number); const s = Math.max(vw / r.width, vh / r.height); return [vx + vw / 2 + (e.clientX - r.left - r.width / 2) * s, vy + vh / 2 + (e.clientY - r.top - r.height / 2) * s]; };
  let mdrag = false;
  mini.addEventListener('pointerdown', e => { mdrag = true; const [x, y] = miniPoint(e); (h.onMinimap || panToXY)(x, y); e.stopPropagation(); });
  mini.addEventListener('pointermove', e => { if (mdrag) { const [x, y] = miniPoint(e); (h.onMinimap || panToXY)(x, y); } });
  window.addEventListener('pointerup', () => { mdrag = false; });

  return {
    render, fit, zoom, panToXY,
    get miniOn() { return miniOn; },
    setMini(on) { miniOn = !!on; localStorage.setItem('dnd.mini', miniOn ? '1' : '0'); mini.hidden = !miniOn; return miniOn; },
    paintCell(c, r, t) {
      const p = svg.querySelector(`polygon.hx[data-c="${c}"][data-r="${r}"]`); if (!p) return;
      p.setAttribute('fill', t === 'w' ? theme.wall : t === 'a' ? theme.water : t === 'd' ? theme.diff : theme.floor[Math.floor(hash(c, r, 0) * 3)]);
      const art = svg.querySelectorAll('.deco > g')[r * (d?.room.cols || 0) + c]; if (art) art.innerHTML = '';
    },
  };
}
