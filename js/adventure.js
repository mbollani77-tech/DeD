// Creazione dell'avventura (dungeon singolo o campagna con mappa del mondo): usata dal Master e dai giocatori nel gioco cooperativo.
import { insert, insertMany, update, remove, setCampaignState } from './db.js';
import { randomProps } from './random.js';
import { generateWorld, generateTown, freeNear, oasisName } from './world.js';
import { TEMPLATES } from './wizard.js';
import { buildDungeon } from './dungeon.js';
import { partyLevel } from './engine.js';
import { key, dist, neighbors, inBounds } from './hex.js';
import { pick } from './dice.js';
import { hexesFor, FRUTTI } from './rules.js';
import { exploreWorld } from './journey.js';

export async function createGenerated(store, n, link, opts = {}, ui = {}) {
  const cid = store.campaign.id; const toast = (...a) => ui.toast?.(...a); const entsIn = r => store.entities.filter(e => e.room_id === r.id);
  const cfg = { ...(store.campaign.state?.config || {}), ...opts };
  const level = partyLevel(store), party = Math.max(2, store.characters.length || 3);
  let linkInfo = opts.linkAt || null;
  if (link && !linkInfo) {
    const A = link; const occ = new Set(entsIn(A).map(e => key(e.col, e.row))); const cand = [];
    for (let y = 1; y < A.rows - 1; y++) for (let x = 1; x < A.cols - 1; x++) if (A.cells[key(x, y)] !== 'w' && !occ.has(key(x, y)) && dist({ col: x, row: y }, A.meta?.start || { col: 1, row: 1 }) > 2) cand.push({ col: x, row: y });
    if (!cand.length) { toast('Nella stanza attuale non c\'è spazio per una porta.', 'err'); return; }
    const cell = pick(cand);
    const ret = neighbors(cell.col, cell.row).find(h => inBounds(A, h) && A.cells[key(h.col, h.row)] !== 'w' && !occ.has(key(h.col, h.row))) || cell;
    linkInfo = { room: A, cell, ret };
  }
  const base = Object.fromEntries(['tpl', 'size', 'locks', 'themes', 'pool', 'treasure', 'traps', 'monsters', 'diff', 'boss', 'fog', 'levelBonus'].filter(k => cfg[k] !== undefined).map(k => [k, cfg[k]]));
  const { rooms } = await buildDungeon(store, { n, base, level, party, linkInfo, place: opts.linkAt?.place || null });
  if (opts.save) await setCampaignState(store, { config: { tpl: cfg.tpl, size: cfg.size, monsters: cfg.monsters, diff: cfg.diff, treasure: cfg.treasure, traps: cfg.traps, locks: cfg.locks, themes: cfg.themes || null, pool: cfg.pool || null, fog: !!cfg.fog, auto: !!cfg.auto, autoLoot: cfg.autoLoot !== false, boss: cfg.boss || null } });
  return rooms;
}

/** Campagna con mappa del mondo: terreno, strade, paesi e un dungeon per ogni livello del percorso. */
/** Se il database rifiuta gli abitanti dei paesi manca l'aggiornamento (supabase/aggiornamento-npc.sql): lo si dice chiaramente. */
const friendly = e => (/entities_kind_check|check constraint/i.test(String(e?.message || e))
  ? new Error('Il database non accetta ancora gli abitanti dei paesi. Apri Supabase → SQL Editor, incolla ed esegui il contenuto del file supabase/aggiornamento-npc.sql, poi riprova: la creazione è stata annullata e non resta niente a metà.')
  : e);

export async function createWorldCampaign(store, cfg, ui = {}) {
  const base0 = Math.max(0, ...store.rooms.map(r => r.sort)) + 1;
  try { return await buildWorldCampaign(store, cfg, ui); } catch (e) {
    // annulla tutto quello che è stato creato finora (le stanze portano via con sé le loro entità)
    for (const r of store.rooms.filter(r => r.sort >= base0)) await remove(store, 'rooms', r.id).catch(() => {});
    throw friendly(e);
  }
}

async function buildWorldCampaign(store, cfg, ui = {}) {
  const cid = store.campaign.id; const toast = (...a) => ui.toast?.(...a);
  const ds = ['facile', 'normale', 'difficile', 'mortale'];
  toast('Creo il mondo…');
  const w = generateWorld({ cols: cfg.cols, rows: cfg.rows, towns: cfg.towns, dungeons: cfg.levels.length, oases: cfg.oases ?? 2, trees: cfg.trees ?? 3 });
  const base = Math.max(0, ...store.rooms.map(r => r.sort)) + 1;
  const world = await insert(store, 'rooms', { campaign_id: cid, name: 'Mappa del mondo', cols: w.cols, rows: w.rows, fog: false, cells: w.cells, meta: w.meta, sort: base });
  const placeKeys = new Set(w.places.map(p => key(p.col, p.row)));
  const around = p => freeNear(w.cells, w.cols, w.rows, p, placeKeys, 1)[0] || p; // dove si esce da un luogo
  const rowsE = []; let n = 0;
  for (const p of w.places.filter(x => x.tipo === 'paese')) {
    const t = generateTown(); const mid = t.meta.start.row;
    const taken = new Set([...t.npcs.map(x => key(x.col, x.row)), key(1, mid), key(0, mid)]);
    const props = randomProps({ cols: t.cols, rows: t.rows, cells: t.cells }, 'paese', { start: t.meta.start, taken });
    const tr = await insert(store, 'rooms', { campaign_id: cid, name: t.name, cols: t.cols, rows: t.rows, fog: false, cells: t.cells, meta: { ...t.meta, props }, sort: base + 1 + n++ });
    const ret = around(p);
    rowsE.push({ campaign_id: cid, room_id: world.id, kind: 'door', name: t.name, col: p.col, row: p.row, hidden: false, data: { place: 'paese', icon: '🏘️', locked: false, target_room: tr.id, tcol: t.meta.start.col, trow: t.meta.start.row } });
    rowsE.push({ campaign_id: cid, room_id: tr.id, kind: 'door', name: 'Verso la mappa del mondo', col: 0, row: mid, hidden: false, data: { locked: false, target_room: world.id, tcol: ret.col, trow: ret.row } });
    t.npcs.forEach(x => rowsE.push({ campaign_id: cid, room_id: tr.id, kind: 'npc', name: x.name, col: x.col, row: x.row, hidden: false, data: { role: x.role } }));
  }
  w.places.filter(p => p.tipo === 'oasi').forEach(p => rowsE.push({ campaign_id: cid, room_id: world.id, kind: 'door', name: oasisName(p.order), col: p.col, row: p.row, hidden: false, data: { place: 'oasi', icon: '🌴', locked: false } }));
  w.places.filter(p => p.tipo === 'albero').forEach(p => rowsE.push({ campaign_id: cid, room_id: world.id, kind: 'door', name: FRUTTI[p.frutto].albero, col: p.col, row: p.row, hidden: false, data: { place: 'albero', icon: FRUTTI[p.frutto].icona, frutto: p.frutto, locked: false } }));
  await insertMany(store, 'entities', rowsE.filter(r => r.kind !== 'npc'));
  await insertMany(store, 'entities', rowsE.filter(r => r.kind === 'npc')); // se qui il database rifiuta, tutto viene annullato
  const dung = w.places.filter(x => x.tipo === 'dungeon').sort((a, b) => a.order - b.order);
  for (const [i, tid] of cfg.levels.entries()) {
    const tp = TEMPLATES.find(t => t.id === tid); const place = dung[i]; if (!tp || !place) continue;
    toast(`Creo il dungeon ${i + 1} di ${cfg.levels.length}: ${tp.nome}…`);
    await createGenerated(store, cfg.perLevel, null, { ...tp.def, monsters: cfg.monsters, diff: ds[Math.min(3, Math.max(0, ds.indexOf(cfg.diff)) + Math.floor(i / 2))], levelBonus: Math.floor(i / 2), themes: tp.themes, pool: tp.pool, boss: cfg.bossEach ? tp.boss : null, auto: cfg.auto, fog: cfg.fog, quiet: true,
      linkAt: { room: world, cell: place, ret: around(place), place: { nome: tp.nome, icon: tp.icon, hidden: i > 0, order: i } } });
  }
  await setCampaignState(store, { config: { mode: 'mondo', world: world.id, levels: cfg.levels, diff: cfg.diff, monsters: cfg.monsters, encounters: cfg.encounters, auto: !!cfg.auto, autoLoot: cfg.autoLoot !== false, fog: !!cfg.fog }, worldQuests: [] });
  const spots = [w.meta.start, ...freeNear(w.cells, w.cols, w.rows, w.meta.start, new Set([...placeKeys, key(w.meta.start.col, w.meta.start.row)]), store.characters.length)];
  for (const [i, c] of store.characters.entries()) { const s = spots[i] || spots[0]; await update(store, 'characters', c.id, { room_id: world.id, col: s.col, row: s.row, move_left: hexesFor(c.speed) * 2 }); }
  await exploreWorld(store, world, w.meta.start, { name: 'Il gruppo' });
  toast(`Mondo creato: ${w.places.filter(p => p.tipo === 'paese').length} paesi e ${cfg.levels.length} dungeon. Il gruppo parte dal primo paese.`);
  return world;
}


/** Avvia l'avventura scelta nella procedura guidata. Restituisce la stanza da cui si parte. */
export async function startAdventure(store, cfg, ui = {}) {
  if (cfg.mode === 'mondo') return createWorldCampaign(store, cfg, ui);
  const rooms = await createGenerated(store, cfg.n, null, { ...cfg, save: true }, ui);
  // il gruppo parte dalla prima stanza
  const first = rooms[0]; const spots = [first.meta.start, ...freeNear(first.cells, first.cols, first.rows, first.meta.start, new Set([key(first.meta.start.col, first.meta.start.row)]), store.characters.length)];
  for (const [i, c] of store.characters.entries()) { const s = spots[i] || spots[0]; await update(store, 'characters', c.id, { room_id: first.id, col: s.col, row: s.row }); }
  return first;
}
