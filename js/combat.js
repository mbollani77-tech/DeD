// Regole di gioco: movimento, attacchi, magie, trappole, porte, quest, bottino.
import { roll, rollD20, critExpr, scaleDice } from './dice.js';
import { rollD20M, rollExprM } from './rolls.js';
import { mod, prof, hexesFor } from './rules.js';
import { update, patchData, say, setCampaignState } from './db.js';
import { propBlocks } from './props.js';
import { dist, los, key, reachable, hexesWithin } from './hex.js';
import { getEco, saveEco, weaponSlot, spellSlot, spendWeapon, noSlot, advPeek, advConsume, isUnarmed, isRogue, isBonusSpell } from './economia.js';
import { attackFlavor, saveFlavor, mishapFlavor, outcomeOf, MOVE_MISHAPS } from './flavor.js';

const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const noArt = s => s.replace(/^(il|lo|la|le|gli|i|un|uno|una|l)\s+/, '');
const dmgExpr = (dado, m = 0) => (m ? `${dado}${m > 0 ? '+' : ''}${m}` : dado);
const statFor = (ch, s) => (s === 'fin' ? (ch.stats.des >= ch.stats.for ? 'des' : 'for') : s);
const monSave = (e, stat) => (stat === 'des' ? (e.data.dex || 0) : (e.data[stat] || 0));

export const here = (list, roomId, h) => list.filter(e => e.room_id === roomId && e.col === h.col && e.row === h.row);
export const liveMonsters = (store, roomId) => store.entities.filter(e => e.room_id === roomId && e.kind === 'monster' && !e.data.dead);

/** Esagoni occupati. Per i giocatori i mostri nascosti non bloccano; per i mostri le porte sono sempre chiuse. */
export function blockedSet(store, room, { exceptEnt = null, exceptChar = null, monster = false } = {}) {
  const s = propBlocks(room);
  store.entities.forEach(e => {
    if (e.room_id !== room.id || e.id === exceptEnt) return;
    if (e.kind === 'monster' && !e.data.dead && (monster || !e.hidden)) s.add(key(e.col, e.row));
    if (e.kind === 'door' && (e.data.locked || monster)) s.add(key(e.col, e.row));
  });
  store.characters.forEach(c => { if (c.room_id === room.id && c.id !== exceptChar && c.hp > 0) s.add(key(c.col, c.row)); });
  return s;
}

/** Ricorda le stanze già visitate (la mappa del dungeon le mostra ai giocatori). */
export async function markVisited(store, roomId) {
  const v = store.campaign.state?.visited || [];
  if (roomId && !v.includes(roomId)) await setCampaignState(store, { visited: [...v, roomId] });
}

export async function damageEntity(store, ent, dmg) {
  const hp = Math.max(0, (ent.data.hp ?? 0) - dmg); const dead = hp === 0;
  await update(store, 'entities', ent.id, { data: { ...ent.data, hp, dead }, hidden: false });
  return { hp, dead };
}
export async function damageChar(store, ch, dmg) {
  const hp = Math.max(0, ch.hp - dmg);
  await update(store, 'characters', ch.id, { hp }); return { hp, down: hp === 0 };
}
export async function healChar(store, ch, amt) {
  const hp = Math.min(ch.max_hp, ch.hp + amt);
  await update(store, 'characters', ch.id, { hp }); return hp;
}

async function resolveAttack(bonus, ac, adv, label, manual = true) {
  const r = await rollD20M(bonus, adv, label, manual);
  const hit = r.crit || (!r.fumble && r.total >= ac);
  return { r, hit, crit: r.crit, outcome: outcomeOf(r, hit) };
}
/** Commento solo per i momenti che lo meritano (1 naturale, mancato, critico). */
const flav = (outcome, a, d) => (outcome === 'hit' ? '' : ' — ' + attackFlavor(outcome, a, d));

/** opts.i = indice dell'arma; opts.reaction = attacco di opportunità (usa la reazione). */
export async function weaponAttack(store, ch, w, target, adv = null, opts = {}) {
  const i = opts.i ?? (ch.data.armi || []).indexOf(w);
  const slot = opts.reaction ? 'reazione' : weaponSlot(ch, w, i);
  if (!slot) throw new Error(noSlot(ch));
  const m = mod(ch.stats[statFor(ch, w.stat)]);
  const dm = slot === 'bonus' && !isUnarmed(w) ? Math.min(0, m) : m; // la seconda arma non somma il modificatore positivo
  // prima il tiro per colpire (si può annullare), poi si paga l'azione
  const { r, hit, crit, outcome } = await resolveAttack(m + prof(ch.level), target.data.ac ?? 10, advPeek(ch, target, adv), `${ch.name}: tiro per colpire con ${w.nome} contro ${target.name} (CA ${target.data.ac ?? 10})`);
  await advConsume(store, ch);
  if (slot === 'reazione') await saveEco(store, ch, { re: 'Attacco di opportunità' }); else await spendWeapon(store, ch, w, i, slot);
  let txt = `${ch.name} ${slot === 'reazione' ? 'fa un attacco di opportunità su' : slot === 'bonus' ? 'attacca (azione bonus)' : 'attacca'} ${target.name} con ${w.nome}: ${r.text}`;
  if (hit) {
    const d = await rollExprM(dmgExpr(crit ? critExpr(w.dado) : w.dado, dm), `${ch.name}: ${crit ? 'CRITICO! ' : ''}tira i danni di ${w.nome}`); const amt = Math.max(0, d.total);
    const res = await damageEntity(store, target, amt);
    txt += ` → ${crit ? 'CRITICO' : 'colpito'}: ${amt} danni (${d.text})` + (res.dead ? `. ${target.name} è sconfitto!` : '');
  } else txt += ' → mancato';
  say(store, ch.name, 'combat', txt + flav(outcome, ch.name, target.name));
}

export async function castSpell(store, ch, sp, hex, room, adv = null) {
  const slot = spellSlot(ch, sp); if (!slot) throw new Error(noSlot(ch, isBonusSpell(sp)));
  const pay = () => saveEco(store, ch, slot === 'bonus' ? { bo: sp.nome } : { az: sp.nome });
  const cm = mod(ch.stats[ch.data.cast || 'int']), pb = prof(ch.level), dc = 8 + pb + cm;
  const dado = scaleDice(sp.dado, sp.livello === 0 ? ch.level : null);
  const ent = liveMonsters(store, room.id).find(e => e.col === hex.col && e.row === hex.row);
  const pc = store.characters.find(c => c.room_id === room.id && c.col === hex.col && c.row === hex.row);

  if (sp.tipo === 'cura') {
    if (!pc) throw new Error('Scegli un alleato da curare.');
    await pay();
    const d = await rollExprM(dmgExpr(dado, sp.mod ? cm : 0), `${ch.name}: tira la cura di ${sp.nome}`); const hp = await healChar(store, pc, Math.max(1, d.total));
    return say(store, ch.name, 'combat', `${ch.name} lancia ${sp.nome} su ${pc.name}: ${d.text} = ${Math.max(1, d.total)} PF recuperati (${hp}/${pc.max_hp}).`);
  }
  if (sp.tipo === 'attacco' || sp.tipo === 'auto') {
    if (!ent) throw new Error('Scegli un mostro come bersaglio.');
    let hit = true, crit = false, outcome = 'hit', head = `${ch.name} lancia ${sp.nome} contro ${ent.name}`;
    if (sp.tipo === 'attacco') { const a = await resolveAttack(cm + pb, ent.data.ac ?? 10, advPeek(ch, ent, adv), `${ch.name}: tiro per colpire con ${sp.nome} contro ${ent.name} (CA ${ent.data.ac ?? 10})`); hit = a.hit; crit = a.crit; outcome = a.outcome; head += `: ${a.r.text}`; await advConsume(store, ch); }
    await pay();
    if (!hit) return say(store, ch.name, 'combat', `${head} → mancato` + flav(outcome, ch.name, ent.name));
    const d = await rollExprM(crit ? critExpr(dado) : dado, `${ch.name}: ${crit ? 'CRITICO! ' : ''}tira i danni di ${sp.nome}`); const res = await damageEntity(store, ent, d.total);
    return say(store, ch.name, 'combat', `${head} → ${crit ? 'CRITICO' : 'colpito'}: ${d.total} danni (${d.text})` + (res.dead ? `. ${ent.name} è sconfitto!` : ''));
  }
  // tiro salvezza, anche ad area
  let targets;
  if (sp.area) {
    const area = new Set(hexesWithin(room, hex, hexesFor(sp.area)).map(h => key(h.col, h.row)));
    targets = [
      ...liveMonsters(store, room.id).filter(e => area.has(key(e.col, e.row))).map(o => ({ kind: 'e', o })),
      ...store.characters.filter(c => c.room_id === room.id && c.hp > 0 && area.has(key(c.col, c.row))).map(o => ({ kind: 'c', o })),
    ];
  } else {
    if (!ent) throw new Error('Scegli un mostro come bersaglio.');
    targets = [{ kind: 'e', o: ent }];
  }
  if (!targets.length) throw new Error('Nessun bersaglio nell\'area.');
  await pay();
  const d = await rollExprM(dado, `${ch.name}: tira i danni di ${sp.nome} (i bersagli tirano la salvezza da soli)`); const lines = [];
  for (const t of targets) {
    const sm = t.kind === 'e' ? monSave(t.o, sp.salva || 'des') : mod(t.o.stats[sp.salva || 'des']);
    const sv = rollD20(sm, (sp.salva || 'des') === 'des' && getEco(t.o).schiva ? 'adv' : null); const ok = sv.total >= dc;
    const amt = ok ? (sp.meta ? Math.floor(d.total / 2) : 0) : d.total;
    if (amt > 0) { if (t.kind === 'e') await damageEntity(store, t.o, amt); else await damageChar(store, t.o, amt); }
    lines.push(`${t.o.name} ${ok ? 'resiste' : 'fallisce'} (${sv.total}) → ${amt}. ${saveFlavor(ok, t.o.name)}`);
  }
  say(store, ch.name, 'combat', `${ch.name} lancia ${sp.nome} (CD ${dc}): ${d.text} = ${d.total} danni base. ${lines.join(' ')}`);
}

export async function monsterAttack(store, ent, ch, adv = null, opts = {}) {
  const e = getEco(ent);
  if (opts.reaction) { if (e.re) return; } else if (e.az) throw new Error(`${ent.name} ha già usato la sua azione in questo round (${e.az}).`);
  const manual = !opts.reaction; // l'attacco d'opportunità scatta da solo, gli altri li tira il Master
  const { r, hit, crit, outcome } = await resolveAttack(ent.data.atk || 0, ch.ac, advPeek(ent, ch, adv), `${ent.name}: tiro per colpire contro ${ch.name} (CA ${ch.ac})`, manual);
  await saveEco(store, ent, opts.reaction ? { re: 'Attacco di opportunità' } : { az: 'Attacco' });
  let txt = `${ent.name} ${opts.reaction ? 'fa un attacco di opportunità su' : 'attacca'} ${ch.name}: ${r.text}`;
  if (hit) {
    const d = await rollExprM(crit ? critExpr(ent.data.dado || '1d4') : (ent.data.dado || '1d4'), `${ent.name}: ${crit ? 'CRITICO! ' : ''}tira i danni`, manual); const res = await damageChar(store, ch, d.total);
    txt += ` → ${crit ? 'CRITICO' : 'colpito'}: ${d.total} danni (${d.text})` + (res.down ? `. ${ch.name} è a terra!` : '');
  } else txt += ' → mancato';
  say(store, ent.name, 'combat', txt + flav(outcome, ent.name, ch.name));
}

/** Il mostro si avvicina al personaggio più vicino e attacca se è a portata. */
export async function monsterAutoTurn(store, room, ent) {
  const pcs = store.characters.filter(c => c.room_id === room.id && c.hp > 0);
  if (!pcs.length) throw new Error('Nessun personaggio in questa stanza.');
  const nearest = from => pcs.map(c => ({ c, d: dist(from, c) })).sort((a, b) => a.d - b.d)[0];
  if (getEco(ent).az) throw new Error(`${ent.name} ha già usato la sua azione in questo round (${getEco(ent).az}).`);
  const rng = hexesFor(ent.data.gittata || 5);
  const inRange = p => { const n = nearest(p); return n.d <= rng && (n.d <= 1 || los(room, p, n.c)); };
  let pos = { col: ent.col, row: ent.row };
  const bestSpot = speedHexes => {
    const reach = reachable(room, pos, speedHexes, blockedSet(store, room, { exceptEnt: ent.id, monster: true }));
    let best = { col: pos.col, row: pos.row, score: nearest(pos).d * 10 };
    for (const [k, cost] of reach) {
      const [col, row] = k.split(',').map(Number); const p = { col, row };
      const score = nearest(p).d * 10 + cost - (inRange(p) ? 50 : 0);
      if (score < best.score) best = { ...p, score };
    }
    return best;
  };
  const speed = hexesFor(ent.data.speed || 30);
  let dashed = false;
  if (!inRange(pos)) {
    let best = bestSpot(speed);
    if (!inRange(best)) { best = bestSpot(speed * 2); dashed = true; } // non arriva: usa l'azione per Scattare
    if (best.col !== pos.col || best.row !== pos.row) {
      await update(store, 'entities', ent.id, { col: best.col, row: best.row }); pos = best;
      say(store, ent.name, 'combat', `${ent.name} ${dashed ? 'scatta' : 'si muove'} verso ${nearest(pos).c.name}.`);
    }
  }
  if (dashed) return saveEco(store, ent, { az: 'Scatto' });
  const t = nearest(pos);
  if (inRange(pos)) await monsterAttack(store, ent, t.c);
  else say(store, ent.name, 'combat', `${ent.name} non riesce a raggiungere nessuno.`);
}

export async function triggerTrap(store, ch, trap) {
  const d = trap.data; const stat = d.save || 'des';
  const sv = rollD20(mod(ch.stats[stat])); const ok = sv.total >= (d.dc || 12);
  const dmg = roll(d.dado || '1d6'); const amt = ok ? (d.half ? Math.floor(dmg.total / 2) : 0) : dmg.total;
  await update(store, 'entities', trap.id, { hidden: false, data: { ...d, armed: !!d.reusable, triggered: true } });
  const res = amt ? await damageChar(store, ch, amt) : null;
  say(store, ch.name, 'combat', `${ch.name} fa scattare «${trap.name}»! Tiro salvezza ${sv.text} contro CD ${d.dc}: ${ok ? 'riuscito' : 'fallito'} → ${amt} danni (${dmg.text})` + (res?.down ? `. ${ch.name} è a terra!` : '.'));
}

export async function detectTraps(store, ch, room) {
  for (const t of store.entities.filter(e => e.room_id === room.id && e.kind === 'trap' && e.hidden && e.data.armed !== false)) {
    if (dist(ch, t) > 1 || t.data.checked?.[ch.id]) continue;
    const r = rollD20(mod(ch.stats.sag)); const found = r.total >= (t.data.detect || 12);
    await update(store, 'entities', t.id, { hidden: found ? false : t.hidden, data: { ...t.data, checked: { ...(t.data.checked || {}), [ch.id]: true } } });
    if (found) say(store, ch.name, 'event', `${ch.name} individua una trappola: ${t.name}! (Percezione ${r.total})`);
  }
}

export async function disarmTrap(store, ch, trap) {
  const r = rollD20(mod(ch.stats.des)); const dc = trap.data.disarm || 12;
  if (r.total >= dc) { await patchData(store, 'entities', trap, { armed: false }); say(store, ch.name, 'event', `${ch.name} disarma «${trap.name}» (${r.text} contro CD ${dc}).`); }
  else if (r.total <= dc - 5) { say(store, ch.name, 'event', `${ch.name} sbaglia il disarmo (${r.text} contro CD ${dc})…`); await triggerTrap(store, ch, trap); }
  else say(store, ch.name, 'event', `${ch.name} non riesce a disarmare «${trap.name}» (${r.text} contro CD ${dc}).`);
}

/** Chi lascia la portata di un mostro (senza Disimpegno) subisce un attacco di opportunità. */
async function opportunityOnLeave(store, room, ch, from, to) {
  if (getEco(ch).disimp) return;
  for (const m of liveMonsters(store, room.id)) {
    if (m.hidden || (m.data.gittata || 5) > 5 || getEco(m).re) continue;
    if (dist(m, from) > 1 || dist(m, to) <= 1) continue;
    say(store, m.name, 'combat', `${ch.name} si allontana da ${m.name}: attacco di opportunità!`);
    await monsterAttack(store, m, ch, null, { reaction: true });
    if (ch.hp <= 0) return;
  }
}

/** Attacco di opportunità del giocatore (usa la reazione) con la sua arma da mischia migliore. */
export async function opportunityAttack(store, ch, target) {
  if (getEco(ch).re) throw new Error(`Hai già usato la reazione in questo round (${getEco(ch).re}).`);
  if (dist(ch, target) > 1) throw new Error('Il bersaglio deve essere adiacente.');
  const avg = d => String(d).replace(/\s/g, '').split(/(?=[+-])/).reduce((a, t) => { const m = t.match(/^[+-]?(\d*)d(\d+)$/); return a + (m ? (+(m[1] || 1)) * (+m[2] + 1) / 2 : +t || 0); }, 0);
  const melee = (ch.data.armi || []).filter(w => (w.gittata || 5) <= 5).sort((a, b) => avg(b.dado) - avg(a.dado));
  if (!melee.length) throw new Error('Non hai un\'arma da mischia.');
  return weaponAttack(store, ch, melee[0], target, null, { reaction: true });
}

/** Azioni generiche per giocatori e mostri: scatto, schivare, disimpegno, aiuto (+ azione scaltra del ladro). */
export async function doAction(store, o, what, ally = null) {
  const e = getEco(o); const isChar = !o.kind; const hexes = hexesFor(o.speed || o.data?.speed || 30);
  const cunning = what.startsWith('scaltra-');
  if (cunning) { if (!isRogue(o)) throw new Error('Solo il Ladro ha l\'Azione scaltra.'); if (e.bo) throw new Error(noSlot(o, true)); }
  else if (e.az) throw new Error(noSlot(o));
  const cost = n => (cunning ? { bo: n } : { az: n });
  const kind = what.replace('scaltra-', '');
  if (kind === 'scatto') {
    await saveEco(store, o, cost(cunning ? 'Azione scaltra: scatto' : 'Scatto'));
    if (isChar) await update(store, 'characters', o.id, { move_left: o.move_left + hexes });
    return say(store, o.name, 'event', `${o.name} scatta${cunning ? ' (azione scaltra)' : ''}: movimento raddoppiato${isChar ? ` (+${hexes} esagoni)` : ''}.`);
  }
  if (kind === 'schiva') {
    await saveEco(store, o, { ...cost('Schivare'), schiva: 1 });
    return say(store, o.name, 'event', `${o.name} si mette sulla difensiva: chi lo attacca ha svantaggio e i suoi tiri salvezza di Destrezza hanno vantaggio fino al prossimo round.`);
  }
  if (kind === 'disimp') {
    await saveEco(store, o, { ...cost(cunning ? 'Azione scaltra: disimpegno' : 'Disimpegno'), disimp: 1 });
    return say(store, o.name, 'event', `${o.name} si disimpegna: i suoi movimenti non provocano attacchi di opportunità.`);
  }
  if (kind === 'aiuto') {
    if (!ally) throw new Error('Scegli chi vuoi aiutare.');
    await saveEco(store, o, cost('Aiuto')); await saveEco(store, ally, { aiuto: 1 });
    return say(store, o.name, 'event', `${o.name} aiuta ${ally.name}: il suo prossimo attacco avrà vantaggio.`);
  }
  throw new Error('Azione sconosciuta.');
}
/** Sposta il PG, attraversa porte sbloccate, innesca trappole, cerca trappole nascoste. */
export async function moveCharacter(store, ch, room, hex, cost) {
  let left = Math.max(0, ch.move_left - cost);
  // incidente di movimento: 1 naturale su un d20 e il PG perde il resto del movimento
  const mishap = MOVE_MISHAPS && rollD20(0).fumble;
  if (mishap) left = 0;
  await opportunityOnLeave(store, room, ch, { col: ch.col, row: ch.row }, hex);
  if (ch.hp <= 0) return; // a terra: non si muove
  const door = store.entities.find(e => e.room_id === room.id && e.kind === 'door' && e.col === hex.col && e.row === hex.row);
  if (door && !door.data.locked && door.data.target_room) {
    await update(store, 'characters', ch.id, { room_id: door.data.target_room, col: door.data.tcol ?? 1, row: door.data.trow ?? 1, move_left: left });
    markVisited(store, door.data.target_room);
    return say(store, ch.name, 'event', `${ch.name} attraversa «${door.name}».` + (mishap ? ' ' + mishapFlavor(ch.name) : ''));
  }
  await update(store, 'characters', ch.id, { col: hex.col, row: hex.row, move_left: left });
  if (mishap) say(store, ch.name, 'event', `${mishapFlavor(ch.name)} (d20: 1, movimento terminato)`);
  const trap = store.entities.find(e => e.room_id === room.id && e.kind === 'trap' && e.data.armed !== false && e.col === hex.col && e.row === hex.row);
  if (trap) await triggerTrap(store, ch, trap);
  await detectTraps(store, ch, room);
}

export async function passDoor(store, ch, door) {
  if (door.data.locked || !door.data.target_room) throw new Error('Questa porta non porta da nessuna parte.');
  await update(store, 'characters', ch.id, { room_id: door.data.target_room, col: door.data.tcol ?? 1, row: door.data.trow ?? 1 });
  markVisited(store, door.data.target_room);
  say(store, ch.name, 'event', `${ch.name} attraversa «${door.name}».`);
}

export async function lootEntity(store, ch, ent) {
  const src = ent.kind === 'treasure' ? ent.data : ent.data.loot;
  if (!src || ent.data.looted) throw new Error('Non c\'è niente da prendere.');
  const oro = src.oro || 0; const oggetti = src.oggetti || [];
  await update(store, 'characters', ch.id, { data: { ...ch.data, oro: (ch.data.oro || 0) + oro, oggetti: [...(ch.data.oggetti || []), ...oggetti] } });
  await patchData(store, 'entities', ent, { looted: true });
  const parts = [oro ? `${oro} monete d'oro` : '', ...oggetti.map(o => o.nome)].filter(Boolean);
  say(store, ch.name, 'event', `${ch.name} apre «${ent.name}» e trova: ${parts.join(', ') || 'niente'}.`);
}

export async function useItem(store, ch, idx) {
  const it = (ch.data.oggetti || [])[idx]; if (!it?.cura) throw new Error('Questo oggetto non si può usare così.');
  if (getEco(ch).az) throw new Error(noSlot(ch));
  await saveEco(store, ch, { az: 'Usare un oggetto' });
  const d = roll(it.cura); const hp = Math.min(ch.max_hp, ch.hp + d.total);
  const rest = ch.data.oggetti.filter((_, i) => i !== idx);
  await update(store, 'characters', ch.id, { hp, data: { ...ch.data, oggetti: rest } });
  say(store, ch.name, 'event', `${ch.name} usa «${it.nome}»: ${d.text} = ${d.total} PF (${hp}/${ch.max_hp}).`);
}

/** Tenta una quest per aprire una porta. `input` = risposta dell'enigma. */
export async function attemptQuest(store, ch, door, quest, input = '') {
  const d = quest.data; let ok = false, detail = '';
  if (quest.kind === 'riddle') {
    const given = noArt(norm(input));
    ok = String(d.answer || '').split('|').map(a => noArt(norm(a))).filter(Boolean).includes(given);
    detail = ok ? 'risposta esatta' : 'risposta sbagliata';
  } else if (quest.kind === 'check') {
    const r = rollD20(mod(ch.stats[d.stat || 'des'])); ok = r.total >= (d.dc || 12); detail = `${r.text} contro CD ${d.dc}`;
  } else {
    const wanted = norm(d.key_item || '');
    const holder = store.characters.find(c => c.room_id === ch.room_id && (c.data.oggetti || []).some(i => norm(i.nome) === wanted));
    ok = !!holder; detail = ok ? `usa «${d.key_item}»` : `serve «${d.key_item}»`;
    if (ok && d.consume) { const arr = [...holder.data.oggetti]; arr.splice(arr.findIndex(i => norm(i.nome) === wanted), 1); await update(store, 'characters', holder.id, { data: { ...holder.data, oggetti: arr } }); }
  }
  if (ok) {
    await update(store, 'quests', quest.id, { solved: true });
    await patchData(store, 'entities', door, { locked: false });
    say(store, ch.name, 'event', `${ch.name} supera «${quest.title}» (${detail}): «${door.name}» si apre!`);
  } else say(store, ch.name, 'event', `${ch.name} tenta «${quest.title}» ma non riesce (${detail}).`);
  return ok;
}
