// Compagni controllati dal gioco: si assumono alla locanda o si convincono con un tiro di Carisma/Intelligenza.
import { insert, update, remove, say } from './db.js';
import { RACES, CLASSES, WEAPONS, SPELLS, STATS, mod, spellCheck, levelForSpell } from './rules.js';
import { key, dist } from './hex.js';
import { freeNear } from './world.js';
import { propBlocks } from './props.js';
import { pick } from './dice.js';
import { defaultSkills } from './skills.js';

export const MAX_COMPANIONS = 2;
const NAMES = { m: ['Bruno', 'Garin', 'Tobias', 'Ragnar', 'Corvo', 'Dante', 'Fenrir', 'Orso', 'Tullio', 'Edoardo'], f: ['Elsa', 'Mira', 'Selene', 'Ilda', 'Liora', 'Nera', 'Alda', 'Brina', 'Zora', 'Marta'], n: ['Vesper', 'Kael', 'Rowan', 'Sasha', 'Ash', 'Noa'] };
export const PRIORITY = { guerriero: ['for', 'cos', 'des', 'sag', 'car', 'int'], barbaro: ['for', 'cos', 'des', 'sag', 'car', 'int'], paladino: ['for', 'car', 'cos', 'sag', 'des', 'int'], ranger: ['des', 'sag', 'cos', 'for', 'int', 'car'],
  ladro: ['des', 'int', 'car', 'cos', 'sag', 'for'], monaco: ['des', 'sag', 'cos', 'for', 'int', 'car'], chierico: ['sag', 'cos', 'for', 'car', 'des', 'int'], druido: ['sag', 'cos', 'des', 'int', 'car', 'for'],
  bardo: ['car', 'des', 'cos', 'int', 'sag', 'for'], mago: ['int', 'cos', 'des', 'sag', 'car', 'for'], stregone: ['car', 'cos', 'des', 'sag', 'int', 'for'], warlock: ['car', 'cos', 'des', 'sag', 'int', 'for'] };
export const XP_AT = [0, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000];
const mods = s => Object.fromEntries(STATS.map(([k]) => [k, mod(s[k])]));
export const classOf = c => CLASSES.find(k => k.id === (c.data?.classId || c.classId));

/** Spende i punti in ordine di importanza per la classe (massimo 18, per non esagerare). */
function spend(stats, classId, points) {
  const pri = PRIORITY[classId] || PRIORITY.guerriero; const s = { ...stats }; let guard = 200;
  while (points > 0 && guard-- > 0) { const k = pri.find(x => s[x] < 18); if (!k) break; s[k]++; points--; }
  return s;
}

/** Un avventuriero casuale (solo i dati essenziali: la scheda si costruisce quando si arruola). */
export function makeCandidate(level = 1, classId = null) {
  const cls = classId ? CLASSES.find(c => c.id === classId) : pick(CLASSES);
  const genere = pick(['m', 'm', 'f', 'f', 'n']);
  return { name: pick(NAMES[genere]), genere, raceId: pick(RACES).id, classId: cls.id, level: Math.max(1, Math.min(10, level)) };
}

/** Scheda completa a partire da razza, classe, livello e (se già tirate) le caratteristiche di base. Serve sia ai giocatori sia ai compagni. */
export function buildSheet(cand) {
  const race = RACES.find(r => r.id === cand.raceId) || RACES[0]; const cls = CLASSES.find(c => c.id === cand.classId); const level = cand.level || 1;
  const std = [15, 14, 13, 12, 10, 8]; const pri = PRIORITY[cls.id] || PRIORITY.guerriero; const base = cand.base || (() => { const b = {}; pri.forEach((k, i) => { b[k] = std[i]; }); return b; })();
  const raw = Object.fromEntries(STATS.map(([k]) => [k, (base[k] ?? 10) + (race.bonus?.[k] || 0)]));
  const stats = spend(raw, cls.id, (level - 1) * 2); const m = mods(stats);
  const maxHp = Math.max(1, cls.dv + m.cos + (level - 1) * Math.max(1, Math.floor(cls.dv / 2) + 1 + m.cos));
  const magie = cls.magie.map(id => ({ ...SPELLS.find(s => s.id === id) }));
  const tmp = { level, stats, data: { classId: cls.id, cast: cls.cast } };
  if (cls.cast && cls.magie.length) {
    const healer = ['chierico', 'druido', 'bardo'].includes(cls.id);
    const extra = SPELLS.filter(s => s.livello >= 1 && levelForSpell(s.livello) <= level && spellCheck(tmp, s).ok && !magie.some(x => x.id === s.id) && (healer ? (s.tipo === 'cura' || s.tipo === 'rimedio') : (s.tipo !== 'cura' && s.tipo !== 'rimedio')));
    for (let i = 0, n = Math.floor((level - 1) / 2); i < n && extra.length; i++) magie.push({ ...extra.splice(Math.floor(Math.random() * extra.length), 1)[0] });
  }
  return { name: cand.name, race: race.nome, class: cls.nome, level, stats, hp: maxHp, max_hp: maxHp, ac: cls.ac(m), speed: race.speed, move_left: Math.max(1, Math.round(race.speed / 5)),
    data: { raceId: race.id, classId: cls.id, genere: cand.genere || 'n', cast: cls.cast || 'int', abilita: defaultSkills(race.id, cls.id), oro: 0, xp: XP_AT[level] ?? 0, punti: 0, oggetti: [{ nome: 'Pozione di cura', desc: 'Recupera 2d4+2 punti ferita.', cura: '2d4+2' }],
      armi: cls.armi.map(id => ({ ...WEAPONS.find(w => w.id === id) })), magie } };
}

export const buildCompanion = buildSheet;
export const companionsOf = (store, owner) => store.characters.filter(c => c.data?.companion?.owner === owner.id);
export const hirePrice = cand => 40 * cand.level;

const occupied = (store, room, except = []) => new Set([
  ...store.characters.filter(c => c.room_id === room.id && !except.includes(c.id)).map(c => key(c.col, c.row)),
  ...store.entities.filter(e => e.room_id === room.id && (e.kind !== 'monster' || !e.data.dead)).map(e => key(e.col, e.row)),
  ...propBlocks(room),
]);

/** Il compagno entra nel gruppo, accanto a chi l'ha convinto o assunto. */
export async function hireCompanion(store, owner, cand) {
  if (companionsOf(store, owner).length >= MAX_COMPANIONS) throw new Error(`Hai già ${MAX_COMPANIONS} compagni: congedane uno per farne entrare un altro.`);
  const room = store.rooms.find(r => r.id === owner.room_id); const f = buildCompanion(cand);
  const spot = freeNear(room.cells, room.cols, room.rows, owner, occupied(store, room), 1)[0] || { col: owner.col, row: owner.row };
  const comp = await insert(store, 'characters', { campaign_id: store.campaign.id, player: '', ...f, room_id: owner.room_id, col: spot.col, row: spot.row, data: { ...f.data, companion: { owner: owner.id } } });
  say(store, owner.name, 'event', `${cand.name}, ${f.class} di livello ${f.level}, si unisce al gruppo di ${owner.name}!`);
  return comp;
}

export async function dismissCompanion(store, comp) {
  say(store, comp.name, 'event', `${comp.name} saluta il gruppo e se ne va per la sua strada.`);
  await remove(store, 'characters', comp.id);
}

/** Fuori dagli scontri i compagni seguono il loro capogruppo (anche attraverso le porte). */
export async function followLeader(store, leader) {
  if ((store.campaign.state?.init || []).length) return;
  const comps = companionsOf(store, leader).filter(c => c.hp > 0); if (!comps.length) return;
  const room = store.rooms.find(r => r.id === leader.room_id); if (!room) return;
  const taken = occupied(store, room, comps.map(c => c.id));
  for (const c of comps) {
    if (c.room_id === room.id && dist(c, leader) <= 2) { taken.add(key(c.col, c.row)); continue; }
    const spot = freeNear(room.cells, room.cols, room.rows, leader, taken, 1)[0]; if (!spot) continue; taken.add(key(spot.col, spot.row));
    await update(store, 'characters', c.id, { room_id: room.id, col: spot.col, row: spot.row });
  }
}

/** Salendo di livello un compagno spende da solo i punti caratteristica. */
export async function spendAuto(store, c) {
  const points = c.data.punti || 0; if (!points) return;
  const cls = classOf(c); const stats = spend(c.stats, cls?.id, points); const before = mods(c.stats), after = mods(stats);
  const ac = cls ? c.ac + (cls.ac(after) - cls.ac(before)) : c.ac; const hpDelta = (after.cos - before.cos) * c.level;
  await update(store, 'characters', c.id, { stats, ac, max_hp: c.max_hp + hpDelta, hp: c.hp > 0 ? c.hp + hpDelta : c.hp, data: { ...c.data, punti: 0 } });
}
