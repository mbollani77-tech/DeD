// Il potere unico di ogni personaggio: lo decidono razza (nome ed elemento), classe (che cosa fa) e statistiche (quanto è potente).
import { STAT_NAME, mod, prof, hexesFor } from './rules.js';
import { saveEco, getEco, noSlot } from './economia.js';
import { update, say } from './db.js';
import { rollExprM } from './rolls.js';
import { dist } from './hex.js';
import { damageEntity, healChar, liveMonsters, monSave } from './combat.js';
import { applyStatus, tipoNome } from './status.js';
import { turnGuard } from './combatflow.js';

/** Che cosa fa il potere di una classe. */
export const CLASS_CORE = {
  guerriero: { nome: 'Colpo Risoluto', tipo: 'colpo', adv: true, dado: '2d6', desc: 'Il tuo prossimo attacco ha vantaggio e fa danni extra.' },
  barbaro: { nome: 'Furia Ancestrale', tipo: 'colpo', adv: false, dado: '3d6', desc: 'Il tuo prossimo attacco è una furia: danni extra molto alti.' },
  paladino: { nome: 'Castigo Sacro', tipo: 'colpo', adv: false, dado: '2d8', desc: 'Il tuo prossimo attacco colpisce con la forza del tuo giuramento: danni extra.' },
  ranger: { nome: 'Tiro del Cacciatore', tipo: 'colpo', adv: true, dado: '1d10', desc: 'Il tuo prossimo attacco ha vantaggio e un danno extra: perfetto da lontano.' },
  ladro: { nome: 'Passo d\'Ombra', tipo: 'scatto', adv: true, desc: 'Scatti (movimento raddoppiato), ti disimpegni e il tuo prossimo attacco ha vantaggio.' },
  monaco: { nome: 'Vento Interiore', tipo: 'scatto', scudo: 2, desc: 'Scatti (movimento raddoppiato), ti disimpegni e ottieni +2 alla CA fino al prossimo round.' },
  chierico: { nome: 'Luce Guaritrice', tipo: 'cura', dado: '2d8', desc: 'Curi l\'alleato più ferito entro 6 esagoni (anche te).' },
  druido: { nome: 'Corteccia Viva', tipo: 'scudo', scudo: 3, dado: '1d6', desc: 'Ti ricopri di corteccia: bonus alla CA fino al prossimo round e recuperi un po\' di punti ferita.' },
  bardo: { nome: 'Canto Incantato', tipo: 'terrore', desc: 'Un canto ipnotico: i nemici vicini che falliscono la prova perdono il prossimo turno.' },
  warlock: { nome: 'Sguardo dell\'Abisso', tipo: 'terrore', desc: 'Il tuo sguardo gela il sangue: i nemici vicini che falliscono la prova perdono il prossimo turno.' },
  mago: { nome: 'Esplosione Arcana', tipo: 'esplosione', dado: '3d6', desc: 'Un\'esplosione attorno a te: danni a tutti i nemici entro 3 esagoni (dimezzati se superano la prova).' },
  stregone: { nome: 'Onda Primordiale', tipo: 'esplosione', dado: '3d6', desc: 'Un\'onda di potere grezzo: danni a tutti i nemici entro 3 esagoni (dimezzati se superano la prova).' },
};
/** Razza: epiteto del potere ed elemento. */
export const RACE_FLAVOR = {
  umano: { epi: 'dell\'Audacia', elem: 'pura energia', tipo: 'arcano' }, 'elfo-alto': { epi: 'della Stella', elem: 'luce stellare', tipo: 'sacro' }, 'elfo-bosco': { epi: 'della Foresta', elem: 'natura', tipo: 'veleno' },
  nano: { epi: 'della Montagna', elem: 'roccia', tipo: 'fisico' }, halfling: { epi: 'della Fortuna', elem: 'fortuna', tipo: 'arcano' }, gnomo: { epi: 'dell\'Ingegno', elem: 'scintille', tipo: 'fulmine' },
  mezzelfo: { epi: 'del Crepuscolo', elem: 'ombra e luce', tipo: 'necrotico' }, mezzorco: { epi: 'del Sangue', elem: 'ferocia', tipo: 'fisico' }, dragonide: { epi: 'del Drago', elem: 'fuoco', tipo: 'fuoco' }, tiefling: { epi: 'dell\'Abisso', elem: 'fiamma infernale', tipo: 'fuoco' },
};

const scaleDie = (dado, level) => String(dado).replace(/^(\d+)d(\d+)/, (_, n, s) => `${+n + Math.floor(((level || 1) - 1) / 4)}d${s}`);

/** Il potere di un personaggio (calcolato da razza, classe, statistiche e livello: cresce da solo). */
export function powerFor(ch) {
  const core = CLASS_CORE[ch.data?.classId]; if (!core) return null;
  const fl = RACE_FLAVOR[ch.data?.raceId] || RACE_FLAVOR.umano;
  const best = Object.entries(ch.stats || {}).sort((a, b) => b[1] - a[1])[0] || ['for', 10]; const stat = best[0];
  const potenza = Math.max(0, mod(best[1])) + Math.floor((ch.level || 1) / 2) + (ch.data?.raceId === 'umano' ? 1 : 0);
  const dado = core.dado ? scaleDie(core.dado, ch.level) : null; const cd = 8 + prof(ch.level || 1) + Math.max(0, mod(best[1]));
  return { ...core, nome: `${core.nome} ${fl.epi}`, elem: fl.elem, tipoDanno: fl.tipo || 'arcano', stat, potenza, dado, cd,
    riassunto: `${core.desc} Elemento: ${fl.elem} (danno ${tipoNome(fl.tipo || 'arcano')}), resisti a quel tipo di danno fino al prossimo round. Potenziato dalla tua ${STAT_NAME[stat]} (+${potenza}${core.dado ? `, ${dado}` : ''}).` };
}

/** Si può usare ora? Restituisce null se sì, altrimenti il motivo. */
export function powerBlocked(store, ch) {
  const pw = powerFor(ch); if (!pw) return 'Questo personaggio non ha un potere.';
  const st = store.campaign.state || {}; const fight = (st.init || []).length > 0; const e = getEco(ch);
  if (ch.hp <= 0) return 'Sei a terra.';
  if (fight) { if (e.pw) return 'Hai già usato il tuo potere in questo scontro.'; if (e.bo) return noSlot(ch, true); const cur = st.init[st.turn || 0]; if (cur && cur.id !== ch.id && st.init.some(i => i.id === ch.id)) return `Non è il tuo turno: tocca a ${cur.name}.`; return null; }
  if (pw.tipo !== 'cura') return 'Questo potere si usa durante uno scontro.';
  if (ch.data.pwCiclo === (st.completed || 0)) return 'Il tuo potere si ricarica quando finite un dungeon.';
  return null;
}

/** Usa il potere. auto = tiri automatici (compagni). */
export async function usePower(store, ch, { auto = false } = {}) {
  const why = powerBlocked(store, ch); if (why) throw new Error(why);
  turnGuard(store, ch);
  const pw = powerFor(ch); const room = store.rooms.find(r => r.id === ch.room_id); const fight = (store.campaign.state?.init || []).length > 0;
  const mark = async patch => { if (fight) await saveEco(store, ch, { pw: 1, bo: 'Potere', res: [pw.tipoDanno], ...patch }); else await update(store, 'characters', ch.id, { data: { ...store.characters.find(c => c.id === ch.id).data, pwCiclo: store.campaign.state?.completed || 0 } }); };
  const label = t => `${ch.name}: ${t} (${pw.nome})`;
  if (pw.tipo === 'colpo') {
    const dmg = `${pw.dado}+${pw.potenza}`; await mark({ pot: { adv: !!pw.adv, dmg, elem: pw.elem, tipo: pw.tipoDanno, nome: pw.nome } });
    return say(store, ch.name, 'event', `${ch.name} usa il potere «${pw.nome}»: il prossimo attacco ${pw.adv ? 'ha vantaggio e ' : ''}farà ${dmg} danni extra di ${pw.elem}.`);
  }
  if (pw.tipo === 'scatto') {
    const extra = hexesFor(ch.speed) * 2; await mark({ disimp: 1, ...(pw.adv ? { pot: { adv: true, dmg: '0', nome: pw.nome } } : {}), ...(pw.scudo ? { scudo: pw.scudo + Math.floor(pw.potenza / 3) } : {}) });
    await update(store, 'characters', ch.id, { move_left: ch.move_left + extra });
    return say(store, ch.name, 'event', `${ch.name} usa il potere «${pw.nome}» e scatta nell'${pw.elem}: +${extra} esagoni di movimento, nessun attacco di opportunità${pw.adv ? ', il prossimo attacco ha vantaggio' : ''}${pw.scudo ? `, CA +${pw.scudo + Math.floor(pw.potenza / 3)}` : ''}.`);
  }
  if (pw.tipo === 'scudo') {
    const ca = pw.scudo + Math.floor(pw.potenza / 3); await mark({ scudo: ca });
    const d = await rollExprM(`${pw.dado}+${pw.potenza}`, label('tira il recupero'), !auto); const hp = await healChar(store, ch, Math.max(1, d.total));
    return say(store, ch.name, 'event', `${ch.name} usa il potere «${pw.nome}»: CA +${ca} fino al prossimo round e recupera ${Math.max(1, d.total)} PF (${hp}/${ch.max_hp}).`);
  }
  if (pw.tipo === 'cura') {
    const allies = store.characters.filter(c => c.room_id === ch.room_id && c.hp > 0 && c.hp < c.max_hp && dist(c, ch) <= hexesFor(30)).sort((a, b) => a.hp / a.max_hp - b.hp / b.max_hp);
    const t = allies[0]; if (!t) throw new Error('Nessuno ha bisogno di cure qui vicino.');
    const d = await rollExprM(`${pw.dado}+${pw.potenza}`, label(`tira la cura per ${t.name}`), !auto); const amt = Math.max(1, d.total); const hp = await healChar(store, t, amt); await mark({});
    return say(store, ch.name, 'event', `${ch.name} usa il potere «${pw.nome}» su ${t.name}: ${d.text} = ${amt} PF recuperati (${hp}/${t.max_hp}).`);
  }
  const foes = liveMonsters(store, ch.room_id).filter(m => !m.hidden && dist(m, ch) <= (pw.tipo === 'esplosione' ? hexesFor(15) : hexesFor(30)));
  if (!foes.length) throw new Error('Non ci sono nemici abbastanza vicini.');
  if (pw.tipo === 'esplosione') {
    const d = await rollExprM(`${pw.dado}+${pw.potenza}`, label(`tira i danni di ${pw.elem}`), !auto); await mark({}); const lines = [];
    for (const m of foes) { const sv = monSave(m, 'des') + Math.floor(Math.random() * 20) + 1; const ok = sv >= pw.cd; const amt = ok ? Math.floor(d.total / 2) : d.total; const res = await damageEntity(store, m, amt, ch.id, pw.tipoDanno); lines.push(`${m.name} ${ok ? 'resiste' : 'fallisce'} → ${res.dealt}${res.dead ? ' (sconfitto)' : ''}${res.factor === 'imm' ? ' (immune)' : res.factor === 'res' ? ' (resistente)' : ''}`); }
    return say(store, ch.name, 'combat', `${ch.name} usa il potere «${pw.nome}» (CD ${pw.cd}, ${pw.elem}): ${d.text} = ${d.total}. ${lines.join('. ')}.`);
  }
  await mark({}); const hit = [];
  for (const m of foes) { const r = await applyStatus(store, m, 'paura', { dc: pw.cd, stat: 'sag' }); if (r.ok) hit.push(m.name); }
  return say(store, ch.name, 'combat', `${ch.name} usa il potere «${pw.nome}» (CD ${pw.cd}, ${pw.elem}): ${hit.length ? `${hit.join(', ')} ${hit.length > 1 ? 'perdono' : 'perde'} il prossimo turno!` : 'nessun nemico cede, resistono tutti.'}`);
}
