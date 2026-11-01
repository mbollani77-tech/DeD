// Economia delle azioni di un round (D&D 5e, semplificata), per giocatori e mostri:
//   1 azione, 1 azione bonus, 1 reazione, movimento libero, interazioni gratuite.
// Lo stato sta in data.eco di personaggi e mostri (nessuna modifica al database).
import { update } from './db.js';

const FRESH = {
  az: '',        // azione usata (testo: cosa si è fatto), vuoto = libera
  bo: '',        // azione bonus usata
  re: '',        // reazione usata
  att: 0,        // 1 = l'azione è stata spesa per Attaccare
  atk: 0,        // attacchi extra ancora disponibili in questa azione di Attacco
  mano: -1,      // indice dell'arma usata per l'attacco principale
  leg: 0,        // 1 = l'arma principale era leggera
  schiva: 0,     // 1 = Schivare attivo (svantaggio a chi attacca, vantaggio ai TS di Destrezza)
  disimp: 0,     // 1 = Disimpegno attivo (niente attacchi di opportunità)
  aiuto: 0,      // 1 = ha ricevuto Aiuto (vantaggio al prossimo attacco)
};

export const tableOf = o => (o.kind ? 'entities' : 'characters');
export const getEco = o => ({ ...FRESH, ...(o?.data?.eco || {}) });
export const saveEco = (store, o, patch) => update(store, tableOf(o), o.id, { data: { ...o.data, eco: { ...getEco(o), ...patch } } });

/** Nuovo round: tutti recuperano azione, bonus, reazione. */
export async function resetEco(store) {
  const all = [...store.characters, ...store.entities.filter(e => e.kind === 'monster')];
  for (const o of all) if (o.data?.eco && JSON.stringify(o.data.eco) !== JSON.stringify(FRESH)) await saveEco(store, o, { ...FRESH });
}

export const isLight = w => !!w?.leggera || /pugnale|spada corta|ascia manesca/i.test(w?.nome || '');
export const isUnarmed = w => /senz.?armi/i.test(w?.nome || '');
export const isBonusSpell = s => s?.azione === 'bonus' || /parola guaritrice/i.test(s?.nome || '');
export const isRogue = o => /ladro/i.test(o?.class || '');

/** Attacchi per azione di Attacco (Attacco extra). */
export function attacksPerAction(o) {
  const c = String(o?.class || '').toLowerCase(); const l = o?.level || 1;
  if (c.includes('guerriero')) return l >= 20 ? 4 : l >= 11 ? 3 : l >= 5 ? 2 : 1;
  if (/barbaro|monaco|paladino|ranger/.test(c)) return l >= 5 ? 2 : 1;
  return 1;
}

/** Con che cosa si paga questo attacco? 'extra' | 'azione' | 'bonus' | null (non si può). */
export function weaponSlot(o, w, i) {
  const e = getEco(o);
  if (e.atk > 0) return 'extra';
  if (!e.az) return 'azione';
  if (e.att && !e.bo) {
    if (isLight(w) && e.leg && i !== e.mano) return 'bonus';                      // seconda arma leggera
    if (/monaco/i.test(o.class || '') && isUnarmed(w)) return 'bonus';            // arti marziali
  }
  return null;
}
export function spellSlot(o, sp) {
  const e = getEco(o);
  if (isBonusSpell(sp)) return e.bo ? null : 'bonus';
  return e.az ? null : 'azione';
}

export async function spendWeapon(store, o, w, i, slot) {
  const e = getEco(o);
  if (slot === 'extra') return saveEco(store, o, { atk: e.atk - 1 });
  if (slot === 'bonus') return saveEco(store, o, { bo: w.nome });
  return saveEco(store, o, { az: 'Attacco', att: 1, atk: attacksPerAction(o) - 1, mano: i, leg: isLight(w) ? 1 : 0 });
}

/** Messaggio da mostrare quando non resta nulla con cui pagare. */
export function noSlot(o, bonus = false) {
  const e = getEco(o);
  if (bonus) return `Hai già usato l'azione bonus in questo round (${e.bo}).`;
  return e.az ? `Hai già usato la tua azione in questo round (${e.az}).` : 'Non puoi farlo adesso.';
}

/** Combina vantaggio/svantaggio: se si annullano, tiro normale. */
export const mixAdv = (a, b) => (a && b && a !== b ? null : a || b || null);

/** Vantaggio/svantaggio da Aiuto (chi attacca) e Schivare (chi difende). Consuma l'Aiuto. */
export async function advFor(store, att, def, adv) {
  let a = adv || null;
  if (getEco(att).aiuto) { a = mixAdv(a, 'adv'); await saveEco(store, att, { aiuto: 0 }); }
  if (def && getEco(def).schiva) a = mixAdv(a, 'dis');
  return a;
}
