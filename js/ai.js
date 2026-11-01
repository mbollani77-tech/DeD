// Il turno di un compagno controllato dal gioco: cura chi sta male, beve una pozione, si avvicina e attacca.
import { weaponAttack, castSpell, moveCharacter, blockedSet, useItem, liveMonsters } from './combat.js';
import { weaponCheck, spellCheck, manaOf, spellCost, hexesFor } from './rules.js';
import { reachable, dist, los } from './hex.js';
import { weaponSlot, spellSlot, getEco } from './economia.js';

const avg = d => String(d || '1d4').replace(/\s/g, '').split(/(?=[+-])/).reduce((a, t) => { const m = t.match(/^[+-]?(\d*)d(\d+)$/); return a + (m ? (+(m[1] || 1)) * (+m[2] + 1) / 2 : +t || 0); }, 0);

export async function companionTurn(store, room, comp) {
  if (comp.hp <= 0) return;
  const foes = () => liveMonsters(store, room.id).filter(e => !e.hidden); if (!foes().length) return;
  const allies = () => store.characters.filter(c => c.room_id === room.id && c.hp > 0);
  const reach = () => reachable(room, comp, comp.move_left, blockedSet(store, room, { exceptChar: comp.id }));
  const goTo = async (p, cost) => { if (p.col === comp.col && p.row === comp.row) return; await moveCharacter(store, comp, room, { col: p.col, row: p.row }, cost); };
  const near = (target, range, needLos) => { // il miglior esagono raggiungibile da cui colpire; null se non c'è
    let best = null; const cells = [[{ col: comp.col, row: comp.row }, 0], ...[...reach()].map(([k, c]) => [{ col: +k.split(',')[0], row: +k.split(',')[1] }, c])];
    for (const [p, cost] of cells) { const d = dist(p, target); if (d > range || (needLos && d > 1 && !los(room, p, target))) continue; const score = cost - (range > 1 && d >= 3 ? 1.5 : 0) + (range > 1 ? foes().filter(f => dist(f, p) <= 1).length * 2 : 0); if (!best || score < best.score) best = { p, cost, score }; }
    return best;
  };
  const approach = async target => { let best = null; for (const [k, c] of reach()) { const p = { col: +k.split(',')[0], row: +k.split(',')[1] }; const d = dist(p, target); if (!best || d < best.d || (d === best.d && c < best.c)) best = { p, d, c }; } if (best && best.d < dist(comp, target)) await goTo(best.p, best.c); };

  // 1) bere una pozione se sta davvero male
  if (comp.hp < comp.max_hp * 0.35) { const i = (comp.data.oggetti || []).findIndex(o => o.cura); if (i >= 0) { try { await useItem(store, comp, i); return; } catch { /* niente */ } } }

  // 2) curare chi ha meno del 50% dei punti ferita
  const heals = (comp.data.magie || []).filter(s => s.tipo === 'cura' && spellCheck(comp, s).ok && manaOf(comp) >= spellCost(s) && spellSlot(comp, s));
  const hurt = allies().filter(c => c.hp < c.max_hp * 0.5).sort((a, b) => a.hp / a.max_hp - b.hp / b.max_hp)[0];
  if (heals.length && hurt) {
    const sp = heals.sort((a, b) => avg(b.dado) - avg(a.dado))[0]; const range = hexesFor(sp.gittata);
    if (dist(comp, hurt) > range) { const n = near(hurt, range, false); if (n) await goTo(n.p, n.cost); else await approach(hurt); }
    if (dist(comp, hurt) <= range) { try { await castSpell(store, comp, sp, { col: hurt.col, row: hurt.row }, room, null, true); return; } catch { /* prova ad attaccare */ } }
  }

  // 3) attaccare il nemico più vicino (a parità, il più ferito)
  const target = [...foes()].sort((a, b) => dist(comp, a) - dist(comp, b) || a.data.hp - b.data.hp)[0]; if (!target) return;
  const spells = (comp.data.magie || []).filter(s => ['attacco', 'auto', 'salvezza'].includes(s.tipo) && spellCheck(comp, s).ok && manaOf(comp) >= spellCost(s) && spellSlot(comp, s)
    && (!s.area || foes().filter(f => dist(f, target) <= hexesFor(s.area)).length >= 2)).sort((a, b) => avg(b.dado) - avg(a.dado));
  const weapons = (comp.data.armi || []).map((w, i) => ({ w, i })).filter(({ w, i }) => weaponCheck(comp, w).ok && weaponSlot(comp, w, i)).sort((a, b) => avg(b.w.dado) - avg(a.w.dado));
  const useSpell = spells.length && (weapons.length === 0 || (comp.data.cast && ['mago', 'stregone', 'warlock', 'chierico', 'druido', 'bardo'].includes(comp.data.classId)));
  if (useSpell) {
    const sp = spells[0]; const range = hexesFor(sp.gittata); const n = near(target, range, true);
    if (n) { await goTo(n.p, n.cost); try { await castSpell(store, comp, sp, { col: target.col, row: target.row }, room, null, true); return; } catch { /* arma */ } }
  }
  if (weapons.length) {
    const { w, i } = weapons[0]; const range = hexesFor(w.gittata || 5); const n = near(target, range, true);
    if (!n) { await approach(target); return; }
    await goTo(n.p, n.cost);
    for (let k = 0; k < 4; k++) { const live = store.entities.find(e => e.id === target.id); if (!live || live.data.dead || !weaponSlot(comp, w, i)) break; try { await weaponAttack(store, comp, w, live, null, { i, auto: true }); } catch { break; } if (getEco(comp).atk <= 0 && k > 0) break; }
  } else await approach(target);
}
