// Frasi di commento per il registro di gioco: fallimenti critici, schivate, colpi, movimento.
// Aggiungi o cambia liberamente le frasi: {a} = chi attacca/si muove, {d} = chi subisce/schiva.
import { pick } from './dice.js';

/** Se false, il movimento non ha mai incidenti. */
export const MOVE_MISHAPS = true;

const fill = (s, v) => s.replace(/\{a\}/g, v.a || '').replace(/\{d\}/g, v.d || '');

const POOL = {
  // 1 naturale: l'attaccante combina un pasticcio
  fumble: [
    '{a} perde la presa: l\'arma vola via e gli atterra proprio sul piede!',
    '{a} inciampa nei propri piedi e rischia di infilzarsi da solo.',
    '{a} fa un affondo scomposto e colpisce l\'aria. Che imbarazzo.',
    '{a} scivola e finisce a terra con un tonfo.',
    'L\'arma di {a} gli sfugge di mano e rimbalza rumorosamente lontano.',
    '{a} si impiglia nel mantello e perde l\'equilibrio.',
  ],
  // colpo mancato (non 1 naturale): {d} schiva o para
  miss: [
    '{d} si muove come un gatto e schiva il colpo!',
    '{d} si abbassa all\'ultimo istante: il colpo gli sfiora i capelli.',
    '{d} para con un tintinnio e il colpo scivola via.',
    '{d} fa un passo indietro e il colpo taglia solo l\'aria.',
    '{d} ruota su se stesso e lascia {a} a mani vuote.',
    'Il colpo di {a} rimbalza sull\'armatura di {d} senza nemmeno un graffio.',
  ],
  hit: [
    'Il colpo di {a} va a segno!',
    '{d} non fa in tempo a scansarsi.',
    '{a} trova un varco nella difesa di {d}.',
    '{d} incassa il colpo e barcolla.',
  ],
  crit: [
    'Colpo perfetto! {a} trova il punto debole di {d}!',
    '{d} non se l\'aspettava: un colpo devastante!',
    'Un fendente da manuale: {d} vacilla!',
  ],
  // tiri salvezza (soffi, palle di fuoco, trappole...)
  saveOk: [
    '{d} si getta di lato e evita il peggio!',
    '{d} rotola via appena in tempo.',
    '{d} copre il viso e stringe i denti: se la cava a metà.',
  ],
  saveKo: [
    '{d} viene investito in pieno!',
    '{d} non fa in tempo a reagire.',
    '{d} urla mentre l\'onda lo travolge.',
  ],
  // incidenti di movimento (1 naturale sul d20)
  mishap: [
    '{a} ha preso una storta!',
    '{a} inciampa su una pietra smossa e si ferma a massaggiarsi la caviglia.',
    '{a} scivola su qualcosa di viscido e perde il passo.',
    '{a} si impiglia nel proprio mantello e rallenta.',
  ],
};

/** outcome: 'fumble' | 'miss' | 'hit' | 'crit'. Restituisce la frase di commento. */
export const attackFlavor = (outcome, a, d) => fill(pick(POOL[outcome] || POOL.hit), { a, d });
/** ok = true se il bersaglio supera la salvezza. */
export const saveFlavor = (ok, d) => fill(pick(ok ? POOL.saveOk : POOL.saveKo), { d });
export const mishapFlavor = a => fill(pick(POOL.mishap), { a });

/** Dall'esito di rollD20 + hit/crit all'etichetta usata sopra. */
export const outcomeOf = (r, hit) => (r.crit ? 'crit' : r.fumble ? 'fumble' : hit ? 'hit' : 'miss');
