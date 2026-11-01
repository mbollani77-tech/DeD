// Viaggio sulla mappa del mondo: luoghi che si scoprono, incontri a ogni tappa, incarichi.
import { insert, insertMany, update, remove, say, setCampaignState } from './db.js';
import { randInt, rollD20 } from './dice.js';
import { mod } from './rules.js';
import { key, dist, hexesWithin } from './hex.js';
import { generateRoom } from './random.js';
import { TERRAIN, terrainAt, rollEncounter, freeNear } from './world.js';
import { resetEco } from './economia.js';
import { scaleForParty } from './combatflow.js';
import { makeCandidate, companionsOf, MAX_COMPANIONS } from './companions.js';
import { CLASSES } from './rules.js';

export const isWorld = room => !!room?.meta?.world;
/** Sulla mappa del mondo, fuori dai combattimenti, ogni tappa può essere lunga il doppio del normale movimento. */
export const worldMove = ch => Math.max(1, Math.round((ch.speed || 30) / 5)) * 2;
export const inCombat = store => (store.campaign.state?.init || []).length > 0;
const state = store => store.campaign.state || {};

/* ---------- esplorazione: il mondo si scopre camminando ---------- */
export const EXPLORE_R = 4; // quanto lontano si vede il terreno
export const FIND_R = 2;    // da quanto vicino compare un luogo (albero, oasi, paese, dungeon)
const cellId = (room, c, r) => r * room.cols + c;
/** Caselle del mondo già esplorate (ricordate) più quelle che si vedono adesso intorno ai personaggi. */
export function worldVisible(store, room) {
  const set = new Set(); for (const i of (store.campaign.state?.explored?.[room.id] || [])) set.add(key(i % room.cols, Math.floor(i / room.cols)));
  for (const c of store.characters.filter(x => x.room_id === room.id && x.hp > 0)) hexesWithin(room, c, EXPLORE_R).forEach(h => set.add(key(h.col, h.row)));
  return set;
}
/** Un luogo del mondo si vede solo se già scoperto o se qualcuno del gruppo gli è a meno di FIND_R esagoni. */
export const placeKnown = (store, e, room) => !(room?.meta?.world && e.kind === 'door' && e.data?.place) || (store.campaign.state?.found || []).includes(e.id) || store.characters.some(c => c.room_id === room.id && c.hp > 0 && dist(c, e) <= FIND_R);
/** Ricorda le caselle viste e i luoghi scoperti da questa posizione. */
export async function exploreWorld(store, room, hex, who) {
  const st = store.campaign.state || {}; const old = new Set(st.explored?.[room.id] || []); const before = old.size;
  for (const h of hexesWithin(room, hex, EXPLORE_R)) old.add(cellId(room, h.col, h.row));
  const found = new Set(st.found || []);
  const news = store.entities.filter(x => x.room_id === room.id && x.kind === 'door' && x.data.place && dist(x, hex) <= FIND_R && !found.has(x.id));
  news.forEach(e => found.add(e.id));
  if (old.size === before && !news.length) return;
  await setCampaignState(store, { explored: { ...(st.explored || {}), [room.id]: [...old] }, found: [...found] });
  for (const e of news) { if (e.hidden) await update(store, 'entities', e.id, { hidden: false }); say(store, who.name, 'event', `${who.name} scopre: ${e.name}!`); }
}

/** Dopo ogni spostamento sulla mappa del mondo: scopre i luoghi vicini e tira per un incontro. */
export async function worldTravel(store, ch, room, hex, cost) {
  await exploreWorld(store, room, hex, ch); // si vede il terreno intorno e si scoprono i luoghi a meno di 2 esagoni
  const places = store.entities.filter(x => x.room_id === room.id && x.kind === 'door' && x.data.place).map(x => ({ tipo: x.data.place, col: x.col, row: x.row }));
  if (rollEncounter(room, hex, cost, places, state(store).config?.encounters)) await startEncounter(store, ch, room, hex);
}

const INTRO = {
  B: 'Tra gli alberi si sente un fruscio: qualcuno vi ha teso un agguato nel bosco!',
  S: 'Sulla strada, qualcuno sbuca all\'improvviso e vi sbarra il passo!',
  P: 'Nella pianura aperta si alza la polvere: delle creature vi vengono incontro!',
  C: 'Sulle colline, dietro una roccia, qualcosa si muove...',
  L: 'Dalla palude affiorano ombre e fango: non siete soli!',
  F: 'Mentre guadate il fiume, qualcosa si agita nell\'acqua!',
};

/** Crea al volo una piccola stanza di scontro e vi porta il gruppo che viaggia insieme. */
/** Non tutti gli incontri sono ostili: a volte si incontra un viandante che potrebbe unirsi al gruppo (se lo si convince). */
export async function peacefulMeeting(store, ch, room, hex) {
  for (const old of store.entities.filter(e => e.room_id === room.id && e.kind === 'npc' && e.data.role === 'viandante')) await remove(store, 'entities', old.id);
  const group = store.characters.filter(c => !c.data?.companion && c.room_id === room.id); const lvl = Math.max(1, Math.round(group.reduce((a, c) => a + c.level, 0) / Math.max(1, group.length)));
  const cand = makeCandidate(Math.max(1, lvl + Math.floor(Math.random() * 3) - 1));
  const taken = new Set([...store.characters.filter(c => c.room_id === room.id).map(c => key(c.col, c.row)), ...store.entities.filter(e => e.room_id === room.id).map(e => key(e.col, e.row))]);
  const spot = freeNear(room.cells, room.cols, room.rows, hex, taken, 1)[0]; if (!spot) return;
  try { await insert(store, 'entities', { campaign_id: store.campaign.id, room_id: room.id, kind: 'npc', name: cand.name, col: spot.col, row: spot.row, hidden: false, data: { role: 'viandante', cand, dc: 10 + cand.level, fails: 0 } }); } catch { return; } // database senza abitanti: niente viandante
  say(store, ch.name, 'event', `Lungo la strada ${ch.name} incontra un viandante: ${cand.name}, ${CLASSES.find(c => c.id === cand.classId).nome} di livello ${cand.level}. Non sembra ostile: provate a parlarci!`);
}

/** opts: hostile (nessun viandante), code (terreno da usare), intro (testo), chest (un forziere chiuso da una quest nella stanza dello scontro), name. */
export async function startEncounter(store, ch, room, hex, opts = {}) {
  if (!opts.hostile && !ch.data?.companion && Math.random() < 0.2 && companionsOf(store, ch).length < MAX_COMPANIONS) return peacefulMeeting(store, ch, room, hex);
  const code = opts.code || terrainAt(room, hex.col, hex.row); const terr = TERRAIN[code];
  const group = store.characters.filter(c => c.room_id === room.id && c.hp > 0 && (c.id === ch.id || dist(c, hex) <= 4));
  const level = Math.max(1, Math.round(group.reduce((a, c) => a + c.level, 0) / group.length)); const party = group.length;
  const cfg = state(store).config || {};
  const g = generateRoom({ cols: randInt(10, 13), rows: randInt(8, 10), level, party, hasEntrance: false, hasExit: false, themes: [terr.theme], pool: terr.pool,
    monsters: opts.monsters || (party >= 4 ? 'normali' : 'pochi'), diff: cfg.diff || 'normale', treasure: 'scarsi', traps: 'poche', lockedChance: 0 });
  const pos = {}; group.forEach(c => { pos[c.id] = { col: c.col, row: c.row }; });
  const enc = await insert(store, 'rooms', { campaign_id: store.campaign.id, name: opts.name || `Incontro: ${terr.nome.toLowerCase()}`, cols: g.cols, rows: g.rows, fog: false, cells: g.cells,
    meta: { ...g.meta, encounter: { world: room.id, col: hex.col, row: hex.row, pos } }, sort: 9000 + Math.floor(Math.random() * 999) });
  const exitHex = g.meta.exitFront;
  const rows = g.entities.map(e => { const { _role, ...r } = e; return { campaign_id: store.campaign.id, room_id: enc.id, kind: r.kind, name: r.name, col: r.col, row: r.row, hidden: !!r.hidden, data: { ...r.data } }; });
  rows.push({ campaign_id: store.campaign.id, room_id: enc.id, kind: 'door', name: 'Riprendi il cammino', col: exitHex.col, row: exitHex.row, hidden: false, data: { locked: false, encounter_exit: true, target_room: room.id, tcol: hex.col, trow: hex.row } });
  if (opts.chest) { // il forziere dei guardiani: chiuso da una quest, da aprire a scontro finito
    const q = await insert(store, 'quests', { campaign_id: store.campaign.id, title: opts.chest.quest.title, kind: opts.chest.quest.kind, data: opts.chest.quest.data });
    const taken = new Set(rows.map(r => key(r.col, r.row))); taken.add(key(g.meta.start.col, g.meta.start.row));
    const far = freeNear(g.cells, g.cols, g.rows, g.meta.start, taken, 10); const sp = far[far.length - 1];
    if (sp) rows.push({ campaign_id: store.campaign.id, room_id: enc.id, kind: 'treasure', name: opts.chest.name, col: sp.col, row: sp.row, hidden: false, data: { ...opts.chest.loot, looted: false, locked: true, quest_id: q.id } });
  }
  const made = await insertMany(store, 'entities', rows);
  await scaleForParty(store, enc.id, group); // i nemici crescono con chi viaggia (compagni compresi)
  // il gruppo arriva nella stanza, vicino all'ingresso
  const taken = new Set(); const spots = [g.meta.start, ...freeNear(g.cells, g.cols, g.rows, g.meta.start, new Set([key(g.meta.start.col, g.meta.start.row)]), group.length)];
  for (const [i, c] of group.entries()) { const s = spots[i] || spots[0]; taken.add(key(s.col, s.row)); await update(store, 'characters', c.id, { room_id: enc.id, col: s.col, row: s.row }); }
  const monsters = store.entities.filter(e => e.room_id === enc.id && e.kind === 'monster' && !e.hidden);
  say(store, 'Master', 'event', `${opts.intro || INTRO[code] || 'Un incontro!'} ${monsters.length ? `Compaiono: ${monsters.map(m => m.name).join(', ')}.` : ''}`);
  // iniziativa tirata subito
  const list = [...group.map(c => ({ k: 'c', id: c.id, name: c.name, roll: rollD20(mod(c.stats.des)).total })), ...monsters.map(e => ({ k: 'e', id: e.id, name: e.name, roll: rollD20(e.data.dex || 0).total }))];
  list.sort((a, b) => b.roll - a.roll);
  await resetEco(store);
  await setCampaignState(store, { init: list, turn: 0, round: 1 });
  say(store, 'Master', 'event', `Iniziativa: ${list.map(i => `${i.name} ${i.roll}`).join(', ')}.`);
}

/** Fine dell'incontro: tutti tornano sulla mappa del mondo (ognuno dove era) e la stanza di scontro sparisce. */
export async function endEncounter(store, ch, door) {
  const enc = store.rooms.find(r => r.id === ch.room_id); const info = enc?.meta?.encounter;
  const world = store.rooms.find(r => r.id === door.data.target_room); if (!world) throw new Error('La mappa del mondo non c\'è più.');
  const here = store.characters.filter(c => c.room_id === ch.room_id);
  const taken = new Set(store.characters.filter(c => c.room_id === world.id).map(c => key(c.col, c.row)));
  for (const c of here) {
    let t = info?.pos?.[c.id] || { col: door.data.tcol, row: door.data.trow };
    if (taken.has(key(t.col, t.row))) t = freeNear(world.cells, world.cols, world.rows, t, taken, 1)[0] || t;
    taken.add(key(t.col, t.row));
    await update(store, 'characters', c.id, { room_id: world.id, col: t.col, row: t.row, move_left: worldMove(c) });
  }
  await setCampaignState(store, { init: [], turn: 0, round: 1 });
  await resetEco(store);
  say(store, ch.name, 'event', `${enc?.name ? 'L\'incontro è finito. ' : ''}Il gruppo riprende il cammino.`);
  if (enc) { store.entities = store.entities.filter(e => e.room_id !== enc.id); await remove(store, 'rooms', enc.id).catch(() => {}); }
}

/** Entrando in un luogo per cui c'è un incarico attivo, scatta la ricompensa. */
export async function onPlaceEntered(store, ch, door) {
  const quests = state(store).worldQuests || []; const q = quests.find(x => x.place_id === door.id && x.stato === 'attiva'); if (!q) return;
  await update(store, 'characters', ch.id, { data: { ...ch.data, oro: (ch.data.oro || 0) + q.premio } });
  await setCampaignState(store, { worldQuests: quests.map(x => (x.id === q.id ? { ...x, stato: 'fatta' } : x)) });
  say(store, ch.name, 'event', `Incarico compiuto: ${ch.name} raggiunge ${door.name} e riceve ${q.premio} monete d'oro!`);
}
