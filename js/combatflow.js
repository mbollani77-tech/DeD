// Flusso del combattimento senza Master: inizio automatico dello scontro, fine, turni rispettati e caduta del gruppo.
// (Nessuna dipendenza da combat.js: è combat.js a usare queste funzioni.)
import { insert, update, say, setCampaignState } from './db.js';
import { rollD20 } from './dice.js';
import { mod, maxMana, hexesFor } from './rules.js';
import { dist, key } from './hex.js';
import { resetEco } from './economia.js';
import { freeNear } from './world.js';

/* ---------- difficoltà adattiva: i nemici crescono con i partecipanti allo scontro ---------- */
const SIZE_BASE = 3;
/** Quanti sono in campo: ogni giocatore vale 1, ogni compagno controllato dal gioco 0,75. */
export const partySize = chars => chars.filter(c => c.hp > 0).reduce((a, c) => a + (c.data?.companion ? 0.75 : 1), 0);
export const hpMul = s => Math.max(0.7, Math.min(2.2, s >= SIZE_BASE ? 1 + 0.17 * (s - SIZE_BASE) : 1 - 0.15 * (SIZE_BASE - s)));
export const atkBonus = s => (s >= 7 ? 2 : s >= 5 ? 1 : 0);
export const acBonus = s => (s >= 8 ? 2 : s >= 6 ? 1 : 0);
export const extraMonsters = s => Math.max(0, Math.round((s - SIZE_BASE) * 0.6));

/**
 * Prima di uno scontro: più sono in campo, più i mostri hanno punti ferita, attacco e CA, e arrivano rinforzi; da soli o in due i mostri sono un po' più deboli.
 * Si può spegnere con config.scaling = false. chars = chi partecipa (di default chi è nella stanza).
 */
export async function scaleForParty(store, roomId, chars = null) {
  if (store.campaign.state?.config?.scaling === false) return;
  const members = chars || store.characters.filter(c => c.room_id === roomId); const size = partySize(members); if (!size) return;
  const room = store.rooms.find(r => r.id === roomId); if (!room) return;
  const live = () => store.entities.filter(e => e.room_id === roomId && e.kind === 'monster' && !e.data.dead && !e.hidden);
  for (const m of live()) {
    const d = m.data; if (d.scaleSize === size) continue;
    const baseHp = d.baseHp ?? d.maxHp ?? d.hp, baseAtk = d.baseAtk ?? d.atk ?? 0, baseAc = d.baseAc ?? d.ac ?? 10; const newMax = Math.max(1, Math.round(baseHp * hpMul(size)));
    await update(store, 'entities', m.id, { data: { ...d, baseHp, baseAtk, baseAc, maxHp: newMax, hp: Math.max(1, Math.round((d.hp ?? newMax) / (d.maxHp || newMax) * newMax)), atk: baseAtk + atkBonus(size), ac: baseAc + acBonus(size), scaleSize: size } });
  }
  // rinforzi: copie dei mostri comuni della stanza, una volta sola per ogni aumento del gruppo
  const spawned = room.meta?.reinf || 0; let want = Math.min(extraMonsters(size) - spawned, Math.max(0, 14 - live().length));
  const pool = live().filter(m => !m.data.boss); if (want <= 0 || !pool.length) return;
  const taken = new Set([...store.characters.filter(c => c.room_id === roomId).map(c => key(c.col, c.row)), ...store.entities.filter(e => e.room_id === roomId).map(e => key(e.col, e.row))]);
  const names = new Set(store.entities.filter(e => e.room_id === roomId).map(e => e.name)); const added = [];
  for (let i = 0; i < want; i++) {
    const proto = pool[Math.floor(Math.random() * pool.length)]; const base = proto.name.replace(/\s+\d+$/, ''); let n = 1; while (names.has(`${base} ${n}`)) n++; names.add(`${base} ${n}`);
    const spot = freeNear(room.cells, room.cols, room.rows, proto, taken, 6).filter(s => !taken.has(key(s.col, s.row)))[Math.floor(Math.random() * 3)] || freeNear(room.cells, room.cols, room.rows, proto, taken, 1)[0]; if (!spot) break; taken.add(key(spot.col, spot.row));
    const { dmgBy, loot, looted, ...rest } = proto.data;
    await insert(store, 'entities', { campaign_id: store.campaign.id, room_id: roomId, kind: 'monster', name: `${base} ${n}`, col: spot.col, row: spot.row, hidden: false, data: { ...rest, hp: rest.maxHp, dead: false, dmgBy: {}, eco: undefined } }); added.push(`${base} ${n}`);
  }
  if (added.length) { await update(store, 'rooms', roomId, { meta: { ...room.meta, reinf: spawned + added.length } }); say(store, 'Master', 'event', `Il rumore attira altri nemici: arrivano rinforzi (${added.join(', ')}).`); }
}

/** Chi è in campo ma non è in iniziativa (un mostro scoperto o arrivato a scontro iniziato, un giocatore entrato dopo) si unisce allo scontro. */
export async function syncInit(store) {
  const st = store.campaign.state || {}; const init = st.init || []; if (!init.length) return;
  const rooms = new Set(init.filter(i => i.k === 'c').map(i => store.characters.find(c => c.id === i.id)?.room_id).filter(Boolean));
  const has = id => init.some(i => i.id === id);
  const add = [
    ...store.entities.filter(e => e.kind === 'monster' && rooms.has(e.room_id) && !e.hidden && !e.data.dead && !has(e.id)).map(e => ({ k: 'e', id: e.id, name: e.name, roll: rollD20(e.data.dex || 0).total })),
    ...store.characters.filter(c => c.hp > 0 && rooms.has(c.room_id) && !has(c.id)).map(c => ({ k: 'c', id: c.id, name: c.name, roll: rollD20(mod(c.stats.des)).total })),
  ];
  if (!add.length) return;
  await setCampaignState(store, { init: [...init, ...add] });
  say(store, 'Master', 'event', `${add.map(a => a.name).join(', ')} ${add.length > 1 ? 'si uniscono' : 'si unisce'} allo scontro (iniziativa ${add.map(a => a.roll).join(', ')}): agiranno alla fine del giro.`);
}

export const inCombat = store => (store.campaign.state?.init || []).length > 0;
export const isCoop = store => !!store.campaign.state?.coop;
const liveMons = (store, roomId) => store.entities.filter(e => e.room_id === roomId && e.kind === 'monster' && !e.data.dead);

/** Tira l'iniziativa per i personaggi vivi e i mostri visibili della stanza. force = rifà l'ordine anche se c'è già uno scontro. */
export async function startCombat(store, roomId, { force = false, first = null } = {}) {
  if (inCombat(store) && !force) return false;
  const chars = store.characters.filter(c => c.room_id === roomId && c.hp > 0);
  if (chars.length && liveMons(store, roomId).some(e => !e.hidden)) await scaleForParty(store, roomId);
  const mons = liveMons(store, roomId).filter(e => !e.hidden);
  if (!chars.length || !mons.length) return false;
  const list = [...chars.map(c => ({ k: 'c', id: c.id, name: c.name, roll: rollD20(mod(c.stats.des)).total })), ...mons.map(e => ({ k: 'e', id: e.id, name: e.name, roll: rollD20(e.data.dex || 0).total }))].sort((a, b) => b.roll - a.roll);
  if (first) { const i = list.findIndex(x => x.id === first); if (i > 0) list.unshift(...list.splice(i, 1)); } // chi attacca per primo ha l'iniziativa
  await setCampaignState(store, { init: list, turn: 0, round: 1 });
  await resetEco(store);
  say(store, 'Master', 'event', `Iniziativa: ${list.map(i => `${i.name} ${i.roll}`).join(', ')}.`);
  return true;
}

/** Quando non resta nessun mostro vivo tra quelli dello scontro, lo scontro finisce e le azioni tornano libere. */
export async function endCombatIfDone(store) {
  if (!inCombat(store)) return;
  const init = store.campaign.state.init;
  if (init.some(i => i.k === 'e' && store.entities.some(e => e.id === i.id && !e.data.dead))) return;
  await setCampaignState(store, { init: [], turn: 0, round: 1 });
  await resetEco(store);
  for (const c of store.characters) { const m = hexesFor(c.speed); if (c.move_left !== m) await update(store, 'characters', c.id, { move_left: m }); } // il movimento torna pieno
  say(store, 'Master', 'event', 'Lo scontro è finito: azioni e movimento tornano liberi.');
}

/** Gioco cooperativo: nessun Master rivela le cose nascoste, quindi mostri in agguato (entro 3 esagoni) e forzieri nascosti (entro 2) si scoprono avvicinandosi. */
async function discover(store, ch, room) {
  for (const e of store.entities.filter(x => x.room_id === room.id && x.hidden && ((x.kind === 'monster' && !x.data.dead && dist(x, ch) <= 3) || (x.kind === 'treasure' && !x.data.looted && dist(x, ch) <= 2)))) {
    await update(store, 'entities', e.id, { hidden: false });
    say(store, ch.name, 'event', e.kind === 'monster' ? `${e.name} salta fuori dall'ombra: era in agguato!` : `${ch.name} scopre qualcosa di nascosto: ${e.name}.`);
  }
}

/** Gioco cooperativo: se, dopo uno spostamento, un mostro sveglio è a portata di vista (7 esagoni), inizia lo scontro. */
export async function maybeStartCombat(store, ch, room) {
  if (!isCoop(store) || room.meta?.world || ch.hp <= 0) return;
  await discover(store, ch, room);
  if (inCombat(store)) return;
  if (liveMons(store, room.id).some(e => !e.hidden && dist(e, ch) <= 7)) await startCombat(store, room.id);
}

/** Gioco cooperativo, in combattimento: agisce solo chi ha il turno. */
export function turnGuard(store, ch) {
  if (!isCoop(store) || !inCombat(store)) return;
  const st = store.campaign.state; const cur = st.init[st.turn || 0]; if (!cur || cur.id === ch.id || !st.init.some(i => i.id === ch.id)) return;
  throw new Error(`Non è il tuo turno: tocca a ${cur.name}.`);
}

/** Tutti a terra: il gruppo si risveglia al punto di partenza, a metà punti ferita, con un quarto dell'oro in meno. */
export async function checkWipe(store) {
  const players = store.characters.filter(c => !c.data?.companion); // i compagni non contano: conta il gruppo dei giocatori
  if (!isCoop(store) || !players.length || players.some(c => c.hp > 0)) return;
  const home = store.rooms.find(r => r.meta?.world) || [...store.rooms].sort((a, b) => a.sort - b.sort)[0]; if (!home) return;
  const start = home.meta?.start || { col: 1, row: 1 }; const taken = new Set();
  const spots = [start, ...freeNear(home.cells, home.cols, home.rows, start, new Set([key(start.col, start.row)]), store.characters.length)];
  say(store, 'Master', 'event', 'Il gruppo è caduto… ma qualcuno li trova e li porta in salvo. Si risvegliano al punto di partenza, doloranti e con la borsa più leggera.');
  await setCampaignState(store, { init: [], turn: 0, round: 1 });
  for (const [i, c] of store.characters.entries()) {
    const s = spots[i] || start; taken.add(key(s.col, s.row)); const tmp = { ...c, data: { ...c.data } };
    await update(store, 'characters', c.id, { hp: Math.max(1, Math.ceil(c.max_hp / 2)), room_id: home.id, col: s.col, row: s.row, move_left: 5, data: { ...c.data, oro: Math.floor((c.data.oro || 0) * 0.75), mana: maxMana(tmp) } });
  }
  await resetEco(store);
}
