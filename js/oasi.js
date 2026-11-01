// Le oasi: entrando si tira un d20 e il risultato decide se è un posto per riposare, un luogo di tesori con una quest, un agguato...
import { insert, update, say } from './db.js';
import { toast } from './ui.js';
import { rollD20M } from './rolls.js';
import { pick } from './dice.js';
import { dist, key } from './hex.js';
import { freeNear } from './world.js';
import { ITEMS, maxMana, manaOf, scrollItem } from './rules.js';
import { randomTreasure, randomChestQuest } from './random.js';
import { startEncounter, peacefulMeeting } from './journey.js';
import { companionsOf, MAX_COMPANIONS } from './companions.js';
import { cureStatus } from './status.js';

/** La tabella del d20: (da, a, esito, descrizione). */
export const TABELLA = [
  [1, 2, 'agguato', 'Mostri in agguato tra le palme!'],
  [3, 5, 'secca', 'L\'acqua è torbida e stagnante: qui non ci si può riposare.'],
  [6, 12, 'sorgente', 'Una sorgente fresca e tranquilla: un ottimo posto per riposare.'],
  [13, 14, 'viandante', 'Un viaggiatore riposa all\'ombra: forse vuole unirsi a voi.'],
  [15, 17, 'forziere', 'Tra le radici c\'è un forziere dimenticato, chiuso da una serratura.'],
  [18, 19, 'custodito', 'Un tesoro custodito: i guardiani balzano fuori dall\'acqua!'],
  [20, 20, 'miracolo', 'La fonte brilla: un\'acqua miracolosa e un tesoro per tutti!'],
];
const esito = n => TABELLA.find(([a, b]) => n >= a && n <= b);
const RIPOSO = new Set(['sorgente', 'viandante', 'forziere', 'miracolo', 'guardiano-finito']);

async function riposa(store, ch, door, done, motivo) {
  if (ch.hp >= ch.max_hp && manaOf(ch) >= maxMana(ch)) return toast('Sei già in piena forma: non hai bisogno di riposare.');
  const last = ch.data.oasi?.[door.id]; if (last !== undefined && last >= done) return toast('Hai già riposato qui: l\'acqua si rinnova quando finirete un dungeon.');
  await update(store, 'characters', ch.id, { hp: ch.max_hp, data: { ...ch.data, mana: maxMana(ch), oasi: { ...(ch.data.oasi || {}), [door.id]: done } } });
  say(store, ch.name, 'event', `${ch.name} riposa all'oasi «${door.name}»${motivo ? ` (${motivo})` : ''}: punti ferita e mana tornano al massimo.`);
  await cureStatus(store, store.characters.find(c => c.id === ch.id), 'comuni', 'l\'acqua dell\'oasi'); // la maledizione resta
}

/** Un forziere (chiuso da una quest, oppure aperto) vicino all'oasi. */
async function forziere(store, room, door, level, { chiuso = true, raro = false } = {}) {
  const taken = new Set([...store.characters.filter(c => c.room_id === room.id).map(c => key(c.col, c.row)), ...store.entities.filter(e => e.room_id === room.id).map(e => key(e.col, e.row))]);
  const sp = freeNear(room.cells, room.cols, room.rows, door, taken, 1)[0]; if (!sp) return null;
  const loot = randomTreasure(level + 1).data; if (!raro && level >= 2 && Math.random() < 0.1) loot.mimic = true; if (raro) loot.oggetti = [pick(ITEMS.rari), scrollItem(Math.min(3, Math.ceil(level / 2) + 1))]; loot.oro = (loot.oro || 0) * (raro ? 3 : 2);
  let quest_id; if (chiuso) { const q = randomChestQuest(level); quest_id = (await insert(store, 'quests', { campaign_id: store.campaign.id, title: q.title, kind: q.kind, data: q.data })).id; }
  return insert(store, 'entities', { campaign_id: store.campaign.id, room_id: room.id, kind: 'treasure', name: raro ? 'Forziere miracoloso' : 'Forziere dimenticato', col: sp.col, row: sp.row, hidden: false, data: { ...loot, looted: false, ...(chiuso ? { locked: true, quest_id } : {}), temp: true } });
}

/** Entrare nell'oasi: la prima volta (in ogni «ciclo», cioè tra un dungeon finito e l'altro) si tira il d20 e si scopre cosa succede. */
export async function enterOasi(store, ch, door) {
  if ((store.campaign.state?.init || []).length) throw new Error('Non è il momento: c\'è uno scontro in corso.');
  const room = store.rooms.find(r => r.id === ch.room_id); const done = store.campaign.state?.completed || 0;
  const level = Math.max(1, Math.round(store.characters.filter(c => !c.data?.companion).reduce((a, c) => a + c.level, 0) / Math.max(1, store.characters.filter(c => !c.data?.companion).length)));
  let esitoNome = door.data.ciclo === done ? door.data.esito : null;
  if (!esitoNome) {
    const r = await rollD20M(0, null, `${ch.name} entra nell'oasi «${door.name}»: tira il d20 per scoprire cosa ti aspetta`);
    const [, , nome, desc] = esito(r.nat); esitoNome = nome;
    say(store, ch.name, 'event', `${ch.name} entra nell'oasi «${door.name}» (d20: ${r.nat}): ${desc}`);
    const memo = nome === 'agguato' || nome === 'custodito' ? 'guardiano-finito' : nome; // dopo lo scontro l'oasi diventa un posto di riposo
    await update(store, 'entities', door.id, { data: { ...door.data, ciclo: done, esito: memo } });
    if (nome === 'agguato') return startEncounter(store, ch, room, { col: door.col, row: door.row }, { hostile: true, monsters: 'normali', code: 'B', name: `Agguato all'oasi «${door.name}»`, intro: 'Dall\'acqua e dalle palme escono delle creature: era un agguato!' });
    if (nome === 'custodito') { const q = randomChestQuest(level); return startEncounter(store, ch, room, { col: door.col, row: door.row }, { hostile: true, monsters: 'molti', code: 'B', name: `I guardiani di «${door.name}»`, intro: 'I guardiani del tesoro balzano fuori!', chest: { name: 'Forziere dei guardiani', loot: { ...randomTreasure(level + 1).data, oro: randomTreasure(level + 1).data.oro * 2 }, quest: q } }); }
    if (nome === 'forziere') await forziere(store, room, door, level, { chiuso: true });
    if (nome === 'viandante' && companionsOf(store, ch).length < MAX_COMPANIONS) await peacefulMeeting(store, ch, room, { col: door.col, row: door.row });
    if (nome === 'miracolo') {
      await forziere(store, room, door, level, { chiuso: false, raro: true });
      for (const c of store.characters.filter(x => x.room_id === room.id && dist(x, door) <= 5)) { await update(store, 'characters', c.id, { hp: c.max_hp, data: { ...c.data, mana: maxMana(c), oasi: { ...(c.data.oasi || {}), [door.id]: done } } }); await cureStatus(store, store.characters.find(x => x.id === c.id), 'tutti', 'acqua miracolosa'); }
      return say(store, ch.name, 'event', 'L\'acqua miracolosa guarisce tutto il gruppo: punti ferita e mana al massimo per chi è vicino!');
    }
    if (nome === 'secca') return;
  } else {
    const [, , , desc] = TABELLA.find(t => t[2] === esitoNome || (esitoNome === 'guardiano-finito' && t[2] === 'agguato')) || [];
    toast(`L'oasi è già stata esplorata in questo viaggio: ${desc || ''}`.slice(0, 140));
  }
  if (RIPOSO.has(esitoNome)) await riposa(store, ch, door, done, esitoNome === 'guardiano-finito' ? 'ora è sicura' : '');
  else if (esitoNome === 'secca') toast('L\'acqua è torbida: qui non si può riposare. Riprova dopo aver finito un dungeon.');
}
