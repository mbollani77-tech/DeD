// Alberi con frutti: lungo il cammino si raccolgono frutti curativi; ricrescono quando il gruppo finisce un dungeon.
import { update, say } from './db.js';
import { toast } from './ui.js';
import { FRUTTI } from './rules.js';
import { skillBonus, hasSkill } from './skills.js';

export async function raccogli(store, ch, door) {
  if ((store.campaign.state?.init || []).length) throw new Error('Non è il momento: c\'è uno scontro in corso.');
  const f = FRUTTI[door.data.frutto]; if (!f) throw new Error('Questo albero non dà frutti.');
  const done = store.campaign.state?.completed || 0;
  const restanti = door.data.ciclo === done ? (door.data.restanti ?? f.n) : f.n; // a ogni dungeon finito l'albero rifiorisce
  if (restanti <= 0) return toast(`${door.name} è spoglio: i frutti ricrescono quando finirete un dungeon.`);
  // chi se ne intende di natura trova un frutto in più
  const bonus = (hasSkill(ch, 'natura') || skillBonus(ch, 'natura') >= 3) && restanti >= 2 ? 1 : 0; const n = Math.min(restanti, 1 + bonus);
  const frutti = Array.from({ length: n }, () => ({ ...f.frutto }));
  const cur = store.characters.find(c => c.id === ch.id);
  await update(store, 'characters', ch.id, { data: { ...cur.data, oggetti: [...(cur.data.oggetti || []), ...frutti] } });
  await update(store, 'entities', door.id, { data: { ...door.data, ciclo: done, restanti: restanti - n } });
  say(store, ch.name, 'event', `${ch.name} raccoglie ${f.frutto.nome} ×${n}${n > 1 ? ' (ne trova uno in più: conosce la natura)' : ''} da «${door.name}» (${restanti - n} ${restanti - n === 1 ? 'rimasto' : 'rimasti'}).`);
}
