// Mappa a nido d'ape (SVG): terreno, token, evidenziazioni, zoom e trascinamento.
import { SQ3, center, key } from './hex.js';
import { esc } from './ui.js';

export const SIZE = 24;
const hexPts = (cx, cy, s) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 180 * (60 * i - 30); return `${(cx + s * Math.cos(a)).toFixed(1)},${(cy + s * Math.sin(a)).toFixed(1)}`; }).join(' ');
const initials = n => esc(String(n).replace(/\s+\d+$/, '').slice(0, 2));
const num = n => (String(n).match(/\s(\d+)$/) || [])[1] || '';

export function createBoard(svg, h = {}) {
  let view = null, fitted = null, d = null, drag = null, moved = false, painting = false, lastPaint = null;
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const full = room => ({ x: -SQ3 * SIZE * 0.5 - SIZE * 0.5, y: -SIZE * 1.5, w: SQ3 * SIZE * (room.cols + 0.5) + SIZE, h: SIZE * (1.5 * (room.rows - 1) + 2) + SIZE });
  const apply = () => svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
  const fit = () => { if (d) { view = full(d.room); apply(); } };

  function token(t, cx, cy, extra = '') {
    return `<g class="tok ${t.cls} ${t.ghost ? 'ghost' : ''} ${t.sel ? 'sel' : ''} ${extra}" data-c="${t.col}" data-r="${t.row}" data-kind="${t.kind}" data-id="${t.id}" transform="translate(${cx.toFixed(1)},${cy.toFixed(1)})"><title>${esc(t.title)}</title>${t.body}${t.sel ? `<circle class="selring" r="${SIZE * 0.86}"/>` : ''}</g>`;
  }
  const hpBar = (hp, max) => { const w = SIZE * 1.1, p = Math.max(0, Math.min(1, hp / (max || 1))); return `<rect class="hp-bg" x="${-w / 2}" y="${SIZE * 0.62}" width="${w}" height="4" rx="2"/><rect class="hp-fg ${p < 0.34 ? 'low' : p < 0.67 ? 'mid' : ''}" x="${-w / 2}" y="${SIZE * 0.62}" width="${(w * p).toFixed(1)}" height="4" rx="2"/>`; };
  const glyph = (g, y = 0, s = 0.95) => `<text class="glyph" y="${y}" font-size="${SIZE * s}">${g}</text>`;

  function render(data) {
    d = data; const { room } = d;
    if (!view || fitted !== room.id) { fitted = room.id; fit(); }
    let html = '<g class="hexes">';
    for (let r = 0; r < room.rows; r++) for (let c = 0; c < room.cols; c++) {
      const k = key(c, r); const hide = d.visible && !d.visible.has(k);
      const t = hide ? 'void' : (room.cells[k] || 'f'); const hl = !hide && d.hl?.get(k);
      const [cx, cy] = center(c, r, SIZE);
      html += `<polygon class="hx t-${t}${hl ? ' hl-' + hl : ''}" data-c="${c}" data-r="${r}" points="${hexPts(cx, cy, SIZE - 0.7)}"/>`;
    }
    html += '</g>';
    if (d.showStart && room.meta?.start) { const [cx, cy] = center(room.meta.start.col, room.meta.start.row, SIZE); html += `<g class="startmark" transform="translate(${cx},${cy})"><path d="M-6,8 L-6,-9 L8,-4 L-6,1" /></g>`; }

    const toks = []; const sel = d.sel; const master = d.role === 'master';
    (d.entities || []).forEach(e => {
      if (d.visible && !d.visible.has(key(e.col, e.row))) return;
      const dd = e.data || {}; const s = sel && sel.kind === 'entity' && sel.id === e.id;
      const base = { id: e.id, col: e.col, row: e.row, ghost: master && e.hidden, sel: s, title: e.name + (e.hidden ? ' (nascosto)' : '') };
      if (e.kind === 'door') toks.push({ ...base, z: 0, kind: 'entity', cls: 'door', body: glyph('🚪') + (dd.locked ? `<text class="lock" x="${SIZE * 0.42}" y="${SIZE * 0.5}" font-size="${SIZE * 0.55}">🔒</text>` : '') });
      else if (e.kind === 'trap') toks.push({ ...base, z: 1, kind: 'entity', cls: 'trap' + (dd.armed === false ? ' off' : ''), body: dd.armed === false ? glyph('✖', 0, 0.8) : glyph('⚠️', 0, 0.85) });
      else if (e.kind === 'treasure') toks.push({ ...base, z: 1, kind: 'entity', cls: 'treasure' + (dd.looted ? ' off' : ''), body: glyph(dd.looted ? '📦' : '💰', 0, 0.9) });
      else if (e.kind === 'monster') {
        if (dd.dead) toks.push({ ...base, z: 1, kind: 'entity', cls: 'monster dead', title: e.name + ' (sconfitto)', body: glyph('☠️', 0, 0.85) });
        else toks.push({ ...base, z: 2, kind: 'entity', cls: 'monster', body: `<circle r="${SIZE * 0.68}"/><text class="ini" y="1">${initials(e.name)}</text>${num(e.name) ? `<text class="tag" x="${SIZE * 0.5}" y="${-SIZE * 0.42}">${num(e.name)}</text>` : ''}${hpBar(dd.hp, dd.maxHp)}` });
      }
    });
    (d.characters || []).forEach(c => {
      const s = sel && sel.kind === 'char' && sel.id === c.id; const me = d.meId === c.id;
      toks.push({ id: c.id, col: c.col, row: c.row, z: 3, kind: 'pc', sel: s, title: `${c.name} (${c.hp}/${c.max_hp} PF)`, cls: 'pc' + (me ? ' me' : '') + (c.hp <= 0 ? ' down' : ''), body: `<circle r="${SIZE * 0.68}"/><text class="ini" y="1">${initials(c.name)}</text>${hpBar(c.hp, c.max_hp)}` });
    });
    html += '<g class="tokens">' + toks.sort((a, b) => a.z - b.z).map(t => { const [cx, cy] = center(t.col, t.row, SIZE); return token(t, cx, cy); }).join('') + '</g>';
    svg.innerHTML = html;
    svg.classList.toggle('painting', !!d.paint);
  }

  /** Elementi presenti su un esagono, dal più in alto. */
  const stackAt = (c, r) => [...svg.querySelectorAll(`.tok[data-c="${c}"][data-r="${r}"]`)].reverse().map(el => ({ kind: el.dataset.kind, id: el.dataset.id }));
  const hexOf = el => { const n = el?.closest?.('[data-c]'); return n && svg.contains(n) ? { col: +n.dataset.c, row: +n.dataset.r } : null; };
  const scale = () => { const r = svg.getBoundingClientRect(); return Math.max(view.w / r.width, view.h / r.height); };

  function paintAt(hex) {
    const k = key(hex.col, hex.row); if (k === lastPaint) return; lastPaint = k; h.onPaint?.(hex.col, hex.row);
  }
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
    if (!view || !d) return; const b = full(d.room);
    const nw = Math.min(b.w * 2, Math.max(b.w * 0.2, view.w * f)); const k = nw / view.w;
    view.x += (view.w - view.w * k) * fx; view.y += (view.h - view.h * k) * fy; view.w *= k; view.h *= k; apply();
  }
  svg.addEventListener('wheel', e => {
    e.preventDefault(); const r = svg.getBoundingClientRect();
    zoom(e.deltaY < 0 ? 0.87 : 1.15, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  }, { passive: false });

  return {
    render, fit, zoom,
    paintCell(c, r, t) { const p = svg.querySelector(`polygon[data-c="${c}"][data-r="${r}"]`); if (p) p.setAttribute('class', `hx t-${t || 'f'}`); },
  };
}
