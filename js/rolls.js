// Punto di aggancio per i tiri "a mano": se la pagina monta la barra dei dadi, i tiri
// del giocatore (o del Master per i suoi mostri) li fa chi clicca sul dado; altrimenti il tiro è automatico.
import { rollD20, roll } from './dice.js';

export const hooks = { d20: null, expr: null };

/** d20 con bonus. manual = false → sempre automatico (es. attacchi di opportunità, tiri salvezza dei bersagli). */
export const rollD20M = (bonus, adv, label, manual = true) => (manual && hooks.d20 ? hooks.d20(bonus, adv, label) : Promise.resolve(rollD20(bonus, adv)));
/** Formula di dadi, es. "2d6+3". */
export const rollExprM = (expr, label, manual = true) => (manual && hooks.expr ? hooks.expr(expr, label) : Promise.resolve(roll(expr)));
