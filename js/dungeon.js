// Dungeon: generazione condivisa, completamento (ultima stanza ripulita) e rimodellamento a difficoltà crescente.
import { insert, insertMany, update, remove, say, setCampaignState } from './db.js';
import { generateRoom } from './random.js';
import { randInt } from './dice.js';
import { key } from './hex.js';
import { freeNear } from './world.js';
import { makeCandidate } from './companions.js';

const DIFF_ORDER = ['facile', 'normale', 'difficile', 'mortale'];
const DENS_ORDER = ['pochi', 'normali', 'molti', 'orda'];
export const ROMAN = ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const tierName = (nome, tier) => (tier > 0 ? `${nome} ${ROMAN[Math.min(tier, ROMAN.length - 1)]}` : nome);

/** Impostazioni al giro numero `tier` (0 = la prima volta): ogni giro mostri più forti e più numerosi. */
export function tierCfg(cfg, tier = 0) {
  const di = Math.max(0, DIFF_ORDER.indexOf(cfg.diff || 'normale')), mi = Math.max(0, DENS_ORDER.indexOf(cfg.monsters || 'normali'));
  return { ...cfg, diff: DIFF_ORDER[Math.min(3, di + tier)], monsters: DENS_ORDER[Math.min(3, mi + Math.floor(tier / 2))], levelBonus: (cfg.levelBonus || 0) + Math.floor((tier + 1) / 2) };
}

const SIZES = { piccole: [[10, 13], [8, 10]], medie: [[12, 17], [9, 12]], grandi: [[16, 22], [11, 15]] };
const LOCKS = { rare: 0.25, normali: 0.6, frequenti: 0.9 };
const uid = () => `d${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

/**
 * Genera e salva le stanze di un dungeon con tutte le loro porte, mostri e tesori.
 * { n, base (impostazioni di base), tier, level, party, linkInfo ({room, cell, ret}), place ({nome, icon, hidden, order}), did, skipDoor }
 */
export async function buildDungeon(store, { n, base, tier = 0, level, party, linkInfo = null, place = null, did = uid(), skipDoor = false }) {
  const cid = store.campaign.id; const cfg = tierCfg(base, tier); const lvl = level + (cfg.levelBonus || 0);
  const SZ = SIZES[cfg.size] || null; const LOCK = LOCKS[cfg.locks] ?? 0.6;
  const gens = Array.from({ length: n }, (_, i) => generateRoom({ level: lvl, party, ...(SZ ? { cols: randInt(...SZ[0]), rows: randInt(...SZ[1]) } : {}), lockedChance: LOCK,
    themes: cfg.themes, pool: cfg.pool, treasure: cfg.treasure || 'normali', traps: cfg.traps || 'normali', hasEntrance: linkInfo ? true : i > 0, hasExit: i < n - 1,
    monsters: cfg.monsters || 'normali', diff: cfg.diff || 'normale', extra: Math.max(0, tier - 3), progress: n > 1 ? i / (n - 1) : 0, boss: cfg.boss && i === n - 1 ? cfg.boss : null }));
  gens.forEach((g, i) => { g.meta.dungeon = { id: did, order: i, total: n, tier, ...(i === 0 ? { cfg: base, nome: place?.nome, icon: place?.icon, porder: place?.order } : {}) }; });
  const sort0 = Math.max(0, ...store.rooms.map(r => r.sort)) + 1;
  const rooms = await insertMany(store, 'rooms', gens.map((g, i) => ({ campaign_id: cid, name: tier ? `${g.name} · giro ${tier + 1}` : g.name, cols: g.cols, rows: g.rows, fog: !!cfg.fog, cells: g.cells, meta: g.meta, sort: sort0 + i })));
  rooms.sort((a, b) => a.sort - b.sort);
  const quests = [];
  for (const g of gens) quests.push(g.quest ? await insert(store, 'quests', { campaign_id: cid, title: g.quest.title, kind: g.quest.kind, data: g.quest.data }) : null);
  const rows = [];
  gens.forEach((g, i) => g.entities.forEach(e => {
    const { _role, ...rest } = e;
    const row = { campaign_id: cid, room_id: rooms[i].id, kind: rest.kind, name: rest.name, col: rest.col, row: rest.row, hidden: !!rest.hidden, data: { ...rest.data } };
    if (_role === 'exit' && i < n - 1) { Object.assign(row.data, { target_room: rooms[i + 1].id, tcol: gens[i + 1].meta.start.col, trow: gens[i + 1].meta.start.row }); if (quests[i]) row.data.quest_id = quests[i].id; }
    if (_role === 'entrance') {
      if (i > 0) Object.assign(row.data, { target_room: rooms[i - 1].id, tcol: gens[i - 1].meta.exitFront.col, trow: gens[i - 1].meta.exitFront.row });
      else if (linkInfo) Object.assign(row.data, { target_room: linkInfo.room.id, tcol: linkInfo.ret.col, trow: linkInfo.ret.row });
    }
    rows.push(row);
  }));
  if (linkInfo && !skipDoor) rows.push({ campaign_id: cid, room_id: linkInfo.room.id, kind: 'door', name: tierName(place?.nome || 'Passaggio', tier), col: linkInfo.cell.col, row: linkInfo.cell.row, hidden: !!place?.hidden,
    data: { locked: false, target_room: rooms[0].id, tcol: gens[0].meta.start.col, trow: gens[0].meta.start.row, ...(place ? { place: 'dungeon', icon: place.icon, order: place.order, did, tier } : {}) } });
  // a volte, in una stanza di mezzo, c'è un prigioniero: se lo si convince (Carisma o Intelligenza) diventa un compagno
  if (n >= 3 && Math.random() < 0.4) {
    const i = 1 + Math.floor(Math.random() * (n - 2)); const g = gens[i];
    const taken = new Set([...g.entities.map(e => key(e.col, e.row)), ...(g.meta.props || []).map(p => key(p.c, p.r))]);
    const far = freeNear(g.cells, g.cols, g.rows, g.meta.start, taken, 14); const spot = far[far.length - 1];
    if (spot) { const cand = makeCandidate(Math.max(1, lvl + Math.floor(Math.random() * 3) - 1)); rows.push({ campaign_id: cid, room_id: rooms[i].id, kind: 'npc', name: cand.name, col: spot.col, row: spot.row, hidden: false, data: { role: 'prigioniero', cand, dc: 10 + cand.level, fails: 0 } }); }
  }
  await insertMany(store, 'entities', rows);
  return { rooms, gens, did };
}

export const roomsOf = (store, did) => store.rooms.filter(r => r.meta?.dungeon?.id === did).sort((a, b) => a.meta.dungeon.order - b.meta.dungeon.order);

/** Quando l'ultima stanza non ha più mostri vivi il dungeon è ripulito: compare il portale che lo rimodella. */
export async function checkDungeonDone(store, ent) {
  if (ent.kind !== 'monster') return;
  const room = store.rooms.find(r => r.id === ent.room_id); const info = room?.meta?.dungeon; if (!info || info.order !== info.total - 1) return;
  const state = store.campaign.state?.dungeons || {}; if (state[info.id]?.done) return;
  if (store.entities.some(e => e.room_id === room.id && e.kind === 'monster' && !e.data.dead)) return;
  const first = roomsOf(store, info.id)[0]; const nome = first?.meta?.dungeon?.nome || 'Il dungeon'; const tier = info.tier || 0;
  const completed = (store.campaign.state?.completed || 0) + 1;
  await setCampaignState(store, { dungeons: { ...state, [info.id]: { done: true, tier } }, completed });
  await unlockWaiting(store);
  const taken = new Set(store.entities.filter(e => e.room_id === room.id).map(e => key(e.col, e.row)));
  const near = freeNear(room.cells, room.cols, room.rows, room.meta.start || { col: 1, row: 1 }, taken, 3); const spot = near[near.length - 1];
  if (spot) await insert(store, 'entities', { campaign_id: store.campaign.id, room_id: room.id, kind: 'door', name: 'Portale del ritorno', col: spot.col, row: spot.row, hidden: false, data: { locked: false, renew: info.id } });
  say(store, 'Master', 'event', `Dungeon ripulito: ${tierName(nome, tier)}! Quando il gruppo ne esce (o attraversa il portale nell'ultima stanza) si rimodella: nuove stanze, più mostri e più forti.`);
}

/** Altri dungeon attivi (costruiti e non ancora finiti): se non ce n'è, il rimodellato non ha motivo di aspettare. */
const otherActive = (store, did) => [...new Set(store.rooms.map(r => r.meta?.dungeon?.id).filter(Boolean))].filter(id => id !== did && !store.campaign.state?.dungeons?.[id]?.done);
const avgLevel = store => Math.max(1, Math.round(store.characters.reduce((a, c) => a + c.level, 0) / Math.max(1, store.characters.length)));

/**
 * Rimodella un dungeon: stesso luogo sulla mappa, ma stanze nuove e più difficili.
 * Se sulla mappa c'è un altro dungeon da affrontare, il nuovo giro resta «dormiente» (porta sigillata) finché non se ne finisce un altro.
 * Chi è ancora dentro viene portato fuori (o nella nuova prima stanza se il dungeon non ha un ingresso).
 */
export async function renewDungeon(store, did, level, { defer = true } = {}) {
  const old = roomsOf(store, did); const first = old[0]; if (!first) return null;
  const info = first.meta.dungeon; const tier = (info.tier || 0) + 1; const oldIds = new Set(old.map(r => r.id));
  const world = store.entities.find(e => e.kind === 'door' && e.data.target_room === first.id && !oldIds.has(e.room_id));
  const back = store.entities.find(e => e.room_id === first.id && e.kind === 'door' && first.meta.entrance && e.col === first.meta.entrance.col && e.row === first.meta.entrance.row);
  const linkInfo = world && back ? { room: store.rooms.find(r => r.id === world.room_id), cell: { col: world.col, row: world.row }, ret: { col: back.data.tcol, row: back.data.trow } } : null;
  const place = { nome: info.nome, icon: info.icon, hidden: false, order: info.porder };
  const sleep = !!(defer && linkInfo && otherActive(store, did).length);
  const lvl = level ?? avgLevel(store); const dungeons = store.campaign.state?.dungeons || {};
  let built = null;
  if (sleep) await setCampaignState(store, { dungeons: { ...dungeons, [did]: { done: false, tier, waiting: true, unlockAt: (store.campaign.state?.completed || 0) + 1, pending: { n: info.total, base: info.cfg || {}, place, world: linkInfo.room.id, ret: linkInfo.ret } } } });
  else {
    await setCampaignState(store, { dungeons: { ...dungeons, [did]: { done: false, tier } } });
    built = await buildDungeon(store, { n: info.total, base: info.cfg || {}, tier, level: lvl, party: Math.max(2, store.characters.length), linkInfo, place, did, skipDoor: true });
  }
  // chi era dentro esce (o ricomincia dall'ingresso del nuovo dungeon)
  const inside = store.characters.filter(c => oldIds.has(c.room_id));
  if (linkInfo) { const spots = [linkInfo.ret, ...freeNear(linkInfo.room.cells, linkInfo.room.cols, linkInfo.room.rows, linkInfo.ret, new Set([key(linkInfo.ret.col, linkInfo.ret.row)]), inside.length)]; for (const [i, c] of inside.entries()) await update(store, 'characters', c.id, { room_id: linkInfo.room.id, col: spots[i]?.col ?? linkInfo.ret.col, row: spots[i]?.row ?? linkInfo.ret.row }); }
  else if (built) { const nf = built.rooms[0]; const s = nf.meta.start; const spots = [s, ...freeNear(nf.cells, nf.cols, nf.rows, s, new Set([key(s.col, s.row)]), inside.length)]; for (const [i, c] of inside.entries()) await update(store, 'characters', c.id, { room_id: nf.id, col: spots[i].col, row: spots[i].row }); }
  if (world) {
    if (sleep) await update(store, 'entities', world.id, { name: tierName(info.nome || world.name, tier), data: { ...world.data, locked: true, waiting: true, target_room: null, tier } });
    else { const nf = built.rooms[0]; await update(store, 'entities', world.id, { name: tierName(info.nome || world.name, tier), data: { ...world.data, locked: false, waiting: false, target_room: nf.id, tcol: nf.meta.start.col, trow: nf.meta.start.row, tier } }); }
  }
  for (const r of old) { store.entities = store.entities.filter(e => e.room_id !== r.id); await remove(store, 'rooms', r.id).catch(() => {}); }
  say(store, 'Master', 'event', sleep
    ? `${tierName(info.nome || 'Il dungeon', tier)} si è rimodellato ma ora dorme: la sua porta è sigillata e si riattiverà quando finirete un altro dungeon.`
    : `${tierName(info.nome || 'Il dungeon', tier)}: il dungeon si è rimodellato! Stanze nuove, mostri più numerosi e più forti (giro ${tier + 1}).`);
  return built || { rooms: [], sleeping: true };
}

/** Sveglia i dungeon dormienti per cui è stato finito un altro dungeon (force = tutti, a scelta del Master). */
export async function unlockWaiting(store, { force = false } = {}) {
  let woken = 0;
  for (const [did, st] of Object.entries(store.campaign.state?.dungeons || {})) {
    if (!st.waiting || !(force || (store.campaign.state?.completed || 0) >= st.unlockAt)) continue;
    const p = st.pending; const world = store.rooms.find(r => r.id === p.world); const door = store.entities.find(e => e.data?.did === did && e.data.place === 'dungeon'); if (!world || !door) continue;
    const built = await buildDungeon(store, { n: p.n, base: p.base, tier: st.tier, level: avgLevel(store), party: Math.max(2, store.characters.length), linkInfo: { room: world, cell: { col: door.col, row: door.row }, ret: p.ret }, place: p.place, did, skipDoor: true });
    const nf = built.rooms[0];
    await update(store, 'entities', door.id, { data: { ...door.data, locked: false, waiting: false, target_room: nf.id, tcol: nf.meta.start.col, trow: nf.meta.start.row } });
    await setCampaignState(store, { dungeons: { ...(store.campaign.state?.dungeons || {}), [did]: { done: false, tier: st.tier } } });
    say(store, 'Master', 'event', `${door.name} si risveglia: la sua porta si apre di nuovo, più pericolosa di prima.`); woken++;
  }
  return woken;
}

/** Il personaggio ha lasciato una stanza di un dungeon ripulito: se non c'è più nessuno dentro, si rimodella. */
export async function maybeRenewAfterLeaving(store, fromRoomId, toRoomId) {
  const from = store.rooms.find(r => r.id === fromRoomId); const did = from?.meta?.dungeon?.id; if (!did) return;
  const to = store.rooms.find(r => r.id === toRoomId); if (to?.meta?.dungeon?.id === did) return;
  if (!store.campaign.state?.dungeons?.[did]?.done) return;
  const ids = new Set(roomsOf(store, did).map(r => r.id)); if (store.characters.some(c => ids.has(c.room_id))) return;
  await renewDungeon(store, did);
}

/** Portale dell'ultima stanza: rimodella il dungeon e porta il gruppo fuori (o nella nuova prima stanza). */
export async function usePortal(store, ch, door) {
  say(store, ch.name, 'event', `${ch.name} attraversa il portale: il dungeon si rimodella alle sue spalle.`);
  await renewDungeon(store, door.data.renew);
}
