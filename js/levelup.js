// Punti caratteristica: ad ogni livello se ne guadagnano 2, da spendere come si vuole sulle sei statistiche (massimo 20).
import { update, say } from './db.js';
import { ask } from './ui.js';
import { STATS, mod, CLASSES } from './rules.js';

const MAX_STAT = 20;

/** Finestra per distribuire i punti caratteristica non ancora spesi. */
export async function spendPoints(store, ch) {
  const points = ch.data.punti || 0; if (points <= 0) throw new Error('Non hai punti caratteristica da spendere.');
  const v = await ask({ title: 'Distribuisci i punti caratteristica', ok: 'Conferma', cancel: 'Dopo',
    intro: `Hai <b>${points}</b> ${points === 1 ? 'punto' : 'punti'}: ogni punto aggiunge +1 a una caratteristica (massimo ${MAX_STAT}). Puoi anche tenerne qualcuno per dopo.`,
    fields: STATS.map(([k, l]) => ({ name: k, label: `${l} (ora ${ch.stats[k]})`, type: 'number', value: 0, min: 0, max: Math.min(points, MAX_STAT - ch.stats[k]) })) });
  if (!v) return;
  const add = Object.fromEntries(STATS.map(([k]) => [k, Math.max(0, Math.floor(+v[k] || 0))])); const used = Object.values(add).reduce((a, b) => a + b, 0);
  if (!used) return; if (used > points) throw new Error(`Hai assegnato ${used} punti ma ne hai ${points}.`);
  const stats = { ...ch.stats }; STATS.forEach(([k]) => { stats[k] = Math.min(MAX_STAT, stats[k] + add[k]); });
  // CA e punti ferita seguono le nuove caratteristiche
  const cls = CLASSES.find(c => c.id === ch.data.classId); const mods = s => Object.fromEntries(STATS.map(([k]) => [k, mod(s[k])]));
  const ac = cls ? ch.ac + (cls.ac(mods(stats)) - cls.ac(mods(ch.stats))) : ch.ac;
  const hpDelta = (mod(stats.cos) - mod(ch.stats.cos)) * ch.level;
  await update(store, 'characters', ch.id, { stats, ac, max_hp: ch.max_hp + hpDelta, hp: Math.max(1, ch.hp + (ch.hp > 0 ? hpDelta : 0)), data: { ...ch.data, punti: points - used } });
  say(store, ch.name, 'event', `${ch.name} migliora: ${STATS.filter(([k]) => add[k]).map(([k, l]) => `${l} +${add[k]}`).join(', ')}.`);
}
