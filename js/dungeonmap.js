// Panoramica del dungeon: stanze come miniature collegate dalle porte.
import { roomThumb } from './board.js';
import { ask, esc } from './ui.js';

const W = 190, H = 140, GX = 64, GY = 56;

export function openDungeonMap({ store, role, currentRoomId, onOpen }) {
  const master = role === 'master';
  const rooms = [...store.rooms].sort((a, b) => a.sort - b.sort);
  if (!rooms.length) return ask({ title: 'Mappa del dungeon', ok: '', cancel: 'Chiudi', intro: 'Non ci sono ancora stanze.' });
  const byId = new Map(rooms.map(r => [r.id, r]));
  const doors = store.entities.filter(e => e.kind === 'door' && e.data.target_room && byId.has(e.data.target_room) && byId.has(e.room_id));
  const adj = new Map(rooms.map(r => [r.id, new Set()])); const lockedPair = new Set();
  doors.forEach(d => { adj.get(d.room_id).add(d.data.target_room); adj.get(d.data.target_room).add(d.room_id); if (d.data.locked) lockedPair.add([d.room_id, d.data.target_room].sort().join('|')); });

  const visited = new Set(store.campaign.state?.visited || []); if (currentRoomId) visited.add(currentRoomId);
  store.characters.forEach(c => c.room_id && visited.add(c.room_id));
  const shown = master ? new Set(rooms.map(r => r.id)) : new Set([...visited].filter(id => byId.has(id)));
  const unknown = new Set(); if (!master) shown.forEach(id => adj.get(id).forEach(n => { if (!shown.has(n)) unknown.add(n); }));
  const ids = rooms.map(r => r.id).filter(id => shown.has(id) || unknown.has(id));

  // posizioni: per livelli di distanza (visita in ampiezza)
  const pos = new Map(); const placed = new Set(); let yBase = 0;
  for (const start of ids) {
    if (placed.has(start)) continue; const layers = []; let frontier = [start]; placed.add(start);
    while (frontier.length) { layers.push(frontier); const next = []; frontier.forEach(id => [...adj.get(id)].filter(n => ids.includes(n) && !placed.has(n)).forEach(n => { placed.add(n); next.push(n); })); frontier = next; }
    const tall = Math.max(...layers.map(l => l.length));
    layers.forEach((l, x) => l.forEach((id, y) => pos.set(id, { x: x * (W + GX), y: yBase + (y + (tall - l.length) / 2) * (H + GY) })));
    yBase += tall * (H + GY) + 20;
  }
  const maxX = Math.max(...[...pos.values()].map(p => p.x)) + W, maxY = Math.max(...[...pos.values()].map(p => p.y)) + H + 34;

  let edges = '', cards = ''; const done = new Set();
  doors.forEach(d => { const a = d.room_id, b = d.data.target_room; const k = [a, b].sort().join('|'); if (done.has(k) || !pos.has(a) || !pos.has(b)) return; done.add(k);
    const pa = pos.get(a), pb = pos.get(b); const x1 = pa.x + W / 2, y1 = pa.y + H / 2, x2 = pb.x + W / 2, y2 = pb.y + H / 2; const locked = lockedPair.has(k);
    edges += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${locked ? '#ae3f3a' : '#8aa39a'}" stroke-width="5" ${locked ? 'stroke-dasharray="10 7"' : ''} stroke-linecap="round"/><text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2}" font-size="26" text-anchor="middle" dominant-baseline="central" paint-order="stroke" stroke="#0f161b" stroke-width="6">${locked ? '🔒' : '🚪'}</text>`; });
  ids.forEach(id => {
    const r = byId.get(id), p = pos.get(id), here = id === currentRoomId; const pcs = store.characters.filter(c => c.room_id === id).length;
    if (unknown.has(id)) { cards += `<g transform="translate(${p.x},${p.y})"><rect width="${W}" height="${H}" rx="12" fill="#1a232a" stroke="#4a5964" stroke-width="3" stroke-dasharray="8 6"/><text x="${W / 2}" y="${H / 2}" font-size="54" fill="#6b7a85" text-anchor="middle" dominant-baseline="central">?</text></g>`; return; }
    const th = roomThumb(r, { tokens: [] });
    cards += `<g transform="translate(${p.x},${p.y})" data-room="${id}" class="dm-card ${master ? 'click' : ''}"><rect width="${W}" height="${H}" rx="12" fill="#0f161b" stroke="${here ? '#c0862a' : '#4a5964'}" stroke-width="${here ? 5 : 2}"/><svg x="6" y="6" width="${W - 12}" height="${H - 12}" viewBox="${th.viewBox}" preserveAspectRatio="xMidYMid slice" style="border-radius:8px">${th.svg}</svg>
      <rect x="0" y="${H}" width="${W}" height="30" fill="none"/><text x="${W / 2}" y="${H + 22}" font-size="17" fill="#e8efec" text-anchor="middle" font-family="Source Sans 3, system-ui, sans-serif" font-weight="600">${esc(r.name)}</text>
      ${pcs ? `<g transform="translate(${W - 46},12)"><rect width="38" height="24" rx="12" fill="#277a73" stroke="#fff" stroke-width="2"/><text x="19" y="13" font-size="14" fill="#fff" font-weight="700" text-anchor="middle" dominant-baseline="central">${pcs} PG</text></g>` : ''}</g>`;
  });
  const svg = `<div class="dm"><svg viewBox="-14 -14 ${maxX + 28} ${maxY + 28}" style="min-width:${Math.min(maxX, 900)}px;width:100%" role="img" aria-label="Mappa del dungeon">${edges}${cards}</svg></div><p class="muted" style="margin-top:.5rem">${master ? 'Clicca una stanza per aprirla. ' : ''}Il bordo dorato è la stanza dove si trova il gruppo; la linea tratteggiata rossa è un passaggio chiuso.</p>`;
  return ask({ title: 'Mappa del dungeon', ok: '', cancel: 'Chiudi', extra: svg, wide: true, onMount(form, dlg) {
    dlg.style.width = 'min(1000px, 96vw)'; dlg.style.background = '#e3e9e6';
    form.addEventListener('click', e => { const c = e.target.closest('[data-room]'); if (c && master) { dlg.close(); onOpen?.(c.dataset.room); } });
  } });
}
