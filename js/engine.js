// Motore di gioco condiviso (Master e giocatori): turni, mostri automatici, fine turno.
import { update, say, setCampaignState } from './db.js';
import { hexesFor } from './rules.js';
import { resetEco } from './economia.js';
import { monsterAutoTurn, regenMana, turnStart } from './combat.js';
import { companionTurn } from './ai.js';
import { isCoop } from './combatflow.js';

const CLIENT = Math.random().toString(36).slice(2, 9);
export const partyLevel = store => (store.characters.length ? Math.max(1, Math.round(store.characters.reduce((a, c) => a + c.level, 0) / store.characters.length)) : 1);

/** Nuovo round: movimento e azioni tornano disponibili per tutti. */
export async function resetMoves(store) {
  for (const c of store.characters) { const m = hexesFor(c.speed); if (c.move_left !== m) await update(store, 'characters', c.id, { move_left: m }); }
  await resetEco(store);
}

/** Avanza di un turno (salta chi è a terra o sconfitto). */
export async function stepTurn(store) {
  const st = store.campaign.state || {}; const init = st.init || [];
  let turn = st.turn || 0, round = st.round || 1, newRound = false;
  const alive = i => i.k === 'c' ? (store.characters.find(c => c.id === i.id)?.hp ?? 0) > 0 : !!store.entities.find(e => e.id === i.id && !e.data.dead);
  for (let g = 0; g < init.length * 2; g++) {
    turn++; if (turn >= init.length) { turn = 0; round++; newRound = true; await resetMoves(store); say(store, 'Master', 'event', `Inizia il round ${round}.`); }
    if (!alive(init[turn])) continue;
    const { skip } = await turnStart(store, init[turn]); // danni degli stati, turni persi
    if (skip || !alive(init[turn])) continue;
    break;
  }
  await setCampaignState(store, { turn, round });
  const cur = init[turn]; if (cur) say(store, 'Master', 'event', `Tocca a ${cur.name}${cur.k === 'e' ? ' (mostro)' : ''}.`);
  if (cur?.k === 'c') { const c = store.characters.find(x => x.id === cur.id); if (c) await regenMana(store, c); } // a ogni suo turno recupera un po' di mana
}

let autoRunning = false;
/**
 * I mostri giocano da soli finché non tocca a un giocatore (sempre nel gioco cooperativo; con un Master solo se «Mostri automatici» è attivo).
 * Più browser possono chiamarla: un piccolo blocco condiviso nella campagna evita che due giochino lo stesso mostro.
 */
export async function runAutoMonsters(store) {
  const st0 = store.campaign.state || {};
  const gate = isCoop(store) || !!st0.config?.auto; // i mostri giocano da soli solo in questi casi; i compagni giocano sempre da soli
  if (autoRunning) return;
  const lock = st0.autoLock; if (lock && lock.by !== CLIENT && Date.now() - lock.at < 20000) return;
  const isAuto = i => i && (i.k === 'e' || (i.k === 'c' && store.characters.find(c => c.id === i.id)?.data?.companion));
  const first = (st0.init || [])[st0.turn || 0]; if (!isAuto(first) || (first.k === 'e' && !gate)) return;
  autoRunning = true;
  try {
    await setCampaignState(store, { autoLock: { by: CLIENT, at: Date.now() } });
    for (let guard = 0; guard < 80; guard++) {
      const st = store.campaign.state || {}; const cur = (st.init || [])[st.turn || 0];
      if (!isAuto(cur) || (cur.k === 'e' && !(isCoop(store) || store.campaign.state?.config?.auto))) break;
      const ent = cur.k === 'e' ? store.entities.find(e => e.id === cur.id) : store.characters.find(c => c.id === cur.id);
      if (ent && (cur.k === 'e' ? !ent.data.dead : ent.hp > 0)) {
        const rm = store.rooms.find(r => r.id === ent.room_id);
        await new Promise(r => setTimeout(r, 900)); // il tempo di leggere cosa succede
        try { if (rm) await (cur.k === 'e' ? monsterAutoTurn(store, rm, ent, { auto: true }) : companionTurn(store, rm, ent)); } catch (e) { if (!/già usato/.test(e.message)) say(store, ent.name, 'combat', `${ent.name} resta fermo: ${e.message}`); }
        await new Promise(r => setTimeout(r, 700));
      }
      if (!(store.campaign.state?.init || []).length) break; // lo scontro è finito
      const before = `${st.round}:${st.turn}`; await stepTurn(store);
      const ns = store.campaign.state || {}; if (`${ns.round}:${ns.turn}` === before) break;
      await setCampaignState(store, { autoLock: { by: CLIENT, at: Date.now() } });
    }
  } finally { autoRunning = false; try { await setCampaignState(store, { autoLock: null }); } catch { /* niente */ } }
}

/** Fine del turno di un giocatore: passa al prossimo e, se tocca a un mostro, lo fa giocare. */
export async function endTurn(store, ch) {
  const st = store.campaign.state || {}; const cur = (st.init || [])[st.turn || 0];
  if (!cur) return; // niente scontro: si può agire quando si vuole
  if (cur.id !== ch.id) throw new Error(`Non è il tuo turno: tocca a ${cur.name}.`);
  await stepTurn(store); await runAutoMonsters(store);
}
/** Salta il turno di chi non gioca (ad esempio perché si è scollegato). */
export async function skipTurn(store) {
  const st = store.campaign.state || {}; const cur = (st.init || [])[st.turn || 0]; if (!cur) return;
  say(store, 'Master', 'event', `Il turno di ${cur.name} viene saltato.`); await stepTurn(store); await runAutoMonsters(store);
}
