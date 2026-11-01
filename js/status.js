// Tipi di danno, immunità/resistenze/vulnerabilità e stati (avvelenato, in fiamme, congelato, spaventato, stordito, maledetto).
import { update, say } from './db.js';
import { rollD20 } from './dice.js';
import { mod } from './rules.js';
import { getEco } from './economia.js';

export const TIPI = { fisico: ['Fisico', '⚔️'], fuoco: ['Fuoco', '🔥'], gelo: ['Gelo', '❄️'], fulmine: ['Fulmine', '⚡'], veleno: ['Veleno', '☠️'], sacro: ['Sacro', '✨'], necrotico: ['Necrotico', '💀'], arcano: ['Arcano', '🔮'] };
export const tipoNome = t => (TIPI[t] || TIPI.fisico)[0].toLowerCase();

/** turni 99 = permanente (si toglie solo con una cura speciale). */
export const STATI = {
  veleno: { nome: 'Avvelenato', icona: '🤢', dot: '1d4', tipo: 'veleno', turni: 4, desc: '1d4 danni di veleno a ogni turno.', cura: 'Antidoto, Purificazione, riposo' },
  bruciatura: { nome: 'In fiamme', icona: '🔥', dot: '1d6', tipo: 'fuoco', turni: 3, desc: '1d6 danni di fuoco a ogni turno.', cura: 'Unguento lenitivo, Purificazione, riposo' },
  congelamento: { nome: 'Congelato', icona: '🧊', turni: 3, desc: 'Ti muovi della metà.', cura: 'Brodo caldo, Purificazione, riposo' },
  paura: { nome: 'Spaventato', icona: '😨', turni: 1, salta: true, desc: 'Perdi il prossimo turno.', cura: 'Acqua santa, Purificazione' },
  stordimento: { nome: 'Stordito', icona: '💫', turni: 1, salta: true, desc: 'Perdi il prossimo turno.', cura: 'Purificazione' },
  maledizione: { nome: 'Maledetto', icona: '🕯️', turni: 99, malus: -2, desc: '−2 a tiri per colpire, prove e salvezze. Non passa da sola.', cura: 'Acqua santa o Rimuovi maledizione' },
  resistenza: { nome: 'Resistenza', icona: '🛡️', turni: 20, desc: 'Resisti a un tipo di danno.', cura: '' },
};
/** Stati da cui si guarisce riposando (la maledizione no). */
export const COMUNI = ['veleno', 'bruciatura', 'congelamento', 'paura', 'stordimento'];

/** Cosa imparano a resistere razze e classi (mai vulnerabilità: nessuna razza ha malus). stati = stati a cui sono immuni. */
export const RACE_DEFENSE = {
  'elfo-alto': { res: ['arcano'] }, 'elfo-bosco': { res: ['veleno'] }, nano: { res: ['veleno'] }, halfling: { stati: ['paura'] }, gnomo: { res: ['arcano'] },
  mezzelfo: { res: ['arcano'] }, mezzorco: { res: ['necrotico'] }, dragonide: { res: ['fuoco'] }, tiefling: { res: ['fuoco'] },
};
export const CLASS_DEFENSE = { paladino: { stati: ['paura'] }, chierico: { res: ['necrotico'] }, druido: { res: ['veleno'] }, monaco: { stati: ['veleno'] } };

/** Un'azione può avere un esito sullo stato: tipo di danno → (stato, probabilità). */
export const PROC = { fuoco: ['bruciatura', 0.3], gelo: ['congelamento', 0.3], veleno: ['veleno', 0.4], fulmine: ['stordimento', 0.15], necrotico: ['maledizione', 0.12] };
const STAT_PER_STATO = { veleno: 'cos', bruciatura: 'des', congelamento: 'cos', paura: 'sag', stordimento: 'cos', maledizione: 'sag' };

export const statiOf = t => t?.data?.stati || [];
export const hasStato = (t, id) => statiOf(t).some(s => s.id === id);
export const statusMalus = t => (hasStato(t, 'maledizione') ? STATI.maledizione.malus : 0);
export const statiIcons = t => statiOf(t).map(s => STATI[s.id]?.icona || '').join('');
const table = t => (t.kind ? 'entities' : 'characters');

/** Tutte le difese di un bersaglio e da dove vengono. src[`imm:fuoco`] = 'razza' ecc. */
export function defensesOf(t) {
  const imm = new Set(), res = new Set(), vul = new Set(), stati = new Set(), src = {};
  const add = (set, key, v, from) => { set.add(v); if (!src[key + ':' + v]) src[key + ':' + v] = from; };
  const d = t.data || {};
  if (t.kind) { (d.imm || []).forEach(v => add(imm, 'imm', v, 'natura')); (d.res || []).forEach(v => add(res, 'res', v, 'natura')); (d.vul || []).forEach(v => add(vul, 'vul', v, 'natura')); (d.immSt || []).forEach(v => add(stati, 'st', v, 'natura')); }
  else {
    const rd = RACE_DEFENSE[d.raceId] || {}; const cd = CLASS_DEFENSE[d.classId] || {};
    [['razza', rd], ['classe', cd]].forEach(([from, o]) => { (o.res || []).forEach(v => add(res, 'res', v, from)); (o.imm || []).forEach(v => add(imm, 'imm', v, from)); (o.stati || []).forEach(v => add(stati, 'st', v, from)); });
    (d.oggetti || []).forEach(o => { const df = o.difesa; if (!df) return; (df.res || []).forEach(v => add(res, 'res', v, o.nome)); (df.imm || []).forEach(v => add(imm, 'imm', v, o.nome)); (df.stati || []).forEach(v => add(stati, 'st', v, o.nome)); });
    (getEco(t).res || []).forEach(v => add(res, 'res', v, 'potere'));
    statiOf(t).filter(s => s.id === 'resistenza').forEach(s => add(res, 'res', s.tipo, 'pozione'));
  }
  return { imm, res, vul, stati, src };
}

/** Quanto danno passa davvero: immune = 0, resistente = metà, vulnerabile = doppio (resistenza e vulnerabilità si annullano). */
export function mitigate(t, amount, tipo = 'fisico') {
  const d = defensesOf(t); if (d.imm.has(tipo)) return { dealt: 0, factor: 'imm' };
  const r = d.res.has(tipo), v = d.vul.has(tipo); if (r && !v) return { dealt: Math.floor(amount / 2), factor: 'res' }; if (v && !r) return { dealt: amount * 2, factor: 'vul' };
  return { dealt: amount, factor: '' };
}
export const factorTxt = (factor, tipo) => (factor === 'imm' ? ` — immune a ${tipoNome(tipo)}` : factor === 'res' ? ` — resiste al ${tipoNome(tipo)} (dimezzato)` : factor === 'vul' ? ` — vulnerabile al ${tipoNome(tipo)} (doppio)` : '');
export const dmgLabel = tipo => (tipo && tipo !== 'fisico' ? ` di ${tipoNome(tipo)}` : '');

const saveMod = (t, stat) => (t.kind ? (stat === 'des' ? (t.data.dex || 0) : (t.data[stat] || 0)) : mod(t.stats?.[stat] ?? 10)) + statusMalus(t);

/**
 * Prova a infliggere uno stato. Contro l'immunità non c'è niente da fare; altrimenti il bersaglio tira una salvezza contro `dc`.
 * opts: dc, stat, turni, noSave. Restituisce { ok, why }.
 */
export async function applyStatus(store, t, id, opts = {}) {
  const def = STATI[id]; if (!def) return { ok: false, why: 'sconosciuto' };
  const d = defensesOf(t);
  if (d.stati.has(id) || (def.tipo && d.imm.has(def.tipo))) { say(store, t.name, 'combat', `${t.name} è immune: «${def.nome}» non ha effetto.`); return { ok: false, why: 'immune' }; }
  if (!opts.noSave) { const stat = opts.stat || STAT_PER_STATO[id] || 'cos'; const sv = rollD20(saveMod(t, stat)); if (sv.total >= (opts.dc || 12)) { say(store, t.name, 'combat', `${t.name} evita lo stato «${def.nome}» (${stat.toUpperCase()} ${sv.total} contro CD ${opts.dc || 12}).`); return { ok: false, why: 'salvezza' }; } }
  const cur = statiOf(t); const turni = opts.turni ?? def.turni; const ex = cur.find(s => s.id === id && (s.tipo || '') === (opts.tipo || ''));
  const next = ex ? cur.map(s => (s === ex ? { ...s, turni: Math.max(s.turni, turni) } : s)) : [...cur, { id, turni, ...(opts.tipo ? { tipo: opts.tipo } : {}) }];
  await update(store, table(t), t.id, { data: { ...t.data, stati: next } });
  say(store, t.name, 'combat', `${t.name} è ${def.nome.toLowerCase()}! ${def.desc}`);
  return { ok: true };
}

/** Chance di stato dopo un danno di un certo tipo (solo se il danno è andato a segno). */
export async function maybeProc(store, t, tipo, dealt, { dc = 12, chance = null } = {}) {
  const p = PROC[tipo]; if (!p || dealt <= 0) return null;
  if (Math.random() >= (chance ?? p[1])) return null; return applyStatus(store, t, p[0], { dc });
}

/** Toglie stati (ids = lista, o 'comuni' per tutti tranne la maledizione, o 'tutti'). Restituisce i nomi tolti. */
export async function cureStatus(store, t, ids, motivo = '') {
  const set = ids === 'tutti' ? Object.keys(STATI) : ids === 'comuni' ? COMUNI : ids;
  const cur = statiOf(t); const gone = cur.filter(s => set.includes(s.id) && s.id !== 'resistenza'); if (!gone.length) return [];
  await update(store, table(t), t.id, { data: { ...t.data, stati: cur.filter(s => !gone.includes(s)) } });
  const names = gone.map(s => STATI[s.id].nome.toLowerCase());
  say(store, t.name, 'event', `${t.name} non è più ${names.join(', ')}${motivo ? ` (${motivo})` : ''}.`);
  return names;
}

/** Riassunto per la scheda: [{ icona, testo, da }] di immunità, resistenze, vulnerabilità e immunità agli stati. */
export function defenseList(t) {
  const d = defensesOf(t); const out = [];
  d.imm.forEach(v => out.push({ k: 'imm', icona: TIPI[v]?.[1] || '', testo: `Immune: ${tipoNome(v)}`, da: d.src['imm:' + v] }));
  d.res.forEach(v => out.push({ k: 'res', icona: TIPI[v]?.[1] || '', testo: `Resistenza: ${tipoNome(v)}`, da: d.src['res:' + v] }));
  d.vul.forEach(v => out.push({ k: 'vul', icona: TIPI[v]?.[1] || '', testo: `Vulnerabile: ${tipoNome(v)}`, da: d.src['vul:' + v] }));
  d.stati.forEach(v => out.push({ k: 'st', icona: STATI[v]?.icona || '', testo: `Immune: ${STATI[v]?.nome.toLowerCase() || v}`, da: d.src['st:' + v] }));
  return out;
}
