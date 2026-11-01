// Regole e cataloghi (ispirati a D&D 5e, semplificati). Tutto è modificabile dal Master.
export const STATS = [['for', 'Forza'], ['des', 'Destrezza'], ['cos', 'Costituzione'], ['int', 'Intelligenza'], ['sag', 'Saggezza'], ['car', 'Carisma']];
export const STAT_NAME = Object.fromEntries(STATS);
export const mod = s => Math.floor((s - 10) / 2);
export const prof = lvl => 2 + Math.floor((lvl - 1) / 4);
export const fmtMod = n => (n >= 0 ? '+' : '') + n;
export const FT_PER_HEX = 5;
export const hexesFor = ft => Math.max(1, Math.round(ft / FT_PER_HEX));

export const TERRAIN = { f: 'Pavimento', w: 'Muro', d: 'Terreno difficile', a: 'Acqua' };

// La velocità (in piedi) decide quanti esagoni si percorrono: 30 ft = 6 esagoni.
export const RACES = [
  { id: 'umano', nome: 'Umano', speed: 30, bonus: { for: 1, des: 1, cos: 1, int: 1, sag: 1, car: 1 }, nota: '+1 a tutto' },
  { id: 'elfo-alto', nome: 'Elfo alto', speed: 30, bonus: { des: 2, int: 1 }, nota: 'agile e studioso' },
  { id: 'elfo-bosco', nome: 'Elfo dei boschi', speed: 35, bonus: { des: 2, sag: 1 }, nota: 'il più veloce a piedi' },
  { id: 'nano', nome: 'Nano', speed: 25, bonus: { cos: 2, sag: 1 }, nota: 'robusto, passo corto' },
  { id: 'halfling', nome: 'Halfling', speed: 25, bonus: { des: 2, car: 1 }, nota: 'piccolo e fortunato' },
  { id: 'gnomo', nome: 'Gnomo', speed: 25, bonus: { int: 2, cos: 1 }, nota: 'ingegnoso' },
  { id: 'mezzelfo', nome: 'Mezzelfo', speed: 30, bonus: { car: 2, des: 1, int: 1 }, nota: 'carismatico' },
  { id: 'mezzorco', nome: 'Mezzorco', speed: 30, bonus: { for: 2, cos: 1 }, nota: 'forza bruta' },
  { id: 'dragonide', nome: 'Dragonide', speed: 30, bonus: { for: 2, car: 1 }, nota: 'discendente dei draghi' },
  { id: 'tiefling', nome: 'Tiefling', speed: 30, bonus: { car: 2, int: 1 }, nota: 'sangue infernale' },
];

export const WEAPONS = [
  { id: 'spada-lunga', nome: 'Spada lunga', dado: '1d8', stat: 'for', gittata: 5 },
  { id: 'spadone', nome: 'Spadone', dado: '2d6', stat: 'for', gittata: 5 },
  { id: 'ascia-bipenne', nome: 'Ascia bipenne', dado: '1d12', stat: 'for', gittata: 5 },
  { id: 'mazza', nome: 'Mazza', dado: '1d6', stat: 'for', gittata: 5 },
  { id: 'bastone', nome: 'Bastone ferrato', dado: '1d6', stat: 'for', gittata: 5 },
  { id: 'stocco', nome: 'Stocco', dado: '1d8', stat: 'fin', gittata: 5 },
  { id: 'pugnale', nome: 'Pugnale', dado: '1d4', stat: 'fin', gittata: 5, leggera: true },
  { id: 'spada-corta', nome: 'Spada corta', dado: '1d6', stat: 'fin', gittata: 5, leggera: true },
  { id: 'ascia-manesca', nome: 'Ascia manesca', dado: '1d6', stat: 'for', gittata: 5, leggera: true },
  { id: 'senz-armi', nome: "Colpo senz'armi", dado: '1d4', stat: 'fin', gittata: 5 },
  { id: 'scimitarra', nome: 'Scimitarra', dado: '1d6', stat: 'fin', gittata: 5, leggera: true },
  { id: 'dardo', nome: 'Dardo', dado: '1d4', stat: 'fin', gittata: 20, leggera: true },
  { id: 'giavellotto', nome: 'Giavellotto', dado: '1d6', stat: 'for', gittata: 30 },
  { id: 'arco-corto', nome: 'Arco corto', dado: '1d6', stat: 'des', gittata: 80 },
  { id: 'arco-lungo', nome: 'Arco lungo', dado: '1d8', stat: 'des', gittata: 150 },
  { id: 'balestra', nome: 'Balestra leggera', dado: '1d8', stat: 'des', gittata: 80 },
];

// tipo: attacco (tiro per colpire), salvezza (il bersaglio tira), auto (colpisce sempre), cura
export const SPELLS = [
  { id: 'dardo-di-fuoco', nome: 'Dardo di fuoco', gittata: 120, dado: '1d10', tipo: 'attacco', livello: 0, dmg: 'fuoco' },
  { id: 'raggio-di-gelo', nome: 'Raggio di gelo', gittata: 60, dado: '1d8', tipo: 'attacco', livello: 0, dmg: 'gelo' },
  { id: 'esplosione-occulta', nome: 'Esplosione occulta', gittata: 120, dado: '1d10', tipo: 'attacco', livello: 0, dmg: 'arcano' },
  { id: 'stretta-folgorante', nome: 'Stretta folgorante', gittata: 5, dado: '1d8', tipo: 'attacco', livello: 0, dmg: 'fulmine' },
  { id: 'sferzata-di-spine', nome: 'Sferzata di spine', gittata: 30, dado: '1d6', tipo: 'attacco', livello: 0, dmg: 'fisico' },
  { id: 'sacra-fiamma', nome: 'Sacra fiamma', gittata: 60, dado: '1d8', tipo: 'salvezza', salva: 'des', meta: false, livello: 0, dmg: 'sacro' },
  { id: 'scherno-crudele', nome: 'Scherno crudele', gittata: 60, dado: '1d4', tipo: 'salvezza', salva: 'sag', meta: false, livello: 0, dmg: 'arcano' },
  { id: 'dardo-incantato', nome: 'Dardo incantato', gittata: 120, dado: '3d4+3', tipo: 'auto', livello: 1, dmg: 'arcano' },
  { id: 'cura-ferite', nome: 'Cura ferite', gittata: 5, dado: '1d8', tipo: 'cura', mod: true, livello: 1 },
  { id: 'parola-guaritrice', nome: 'Parola guaritrice', gittata: 60, dado: '1d4', tipo: 'cura', mod: true, livello: 1, azione: 'bonus' },
  { id: 'palla-di-fuoco', nome: 'Palla di fuoco', gittata: 150, dado: '8d6', tipo: 'salvezza', salva: 'des', meta: true, area: 20, livello: 3, dmg: 'fuoco' },
  // nuove magie
  { id: 'tocco-gelido', nome: 'Tocco gelido', gittata: 120, dado: '1d8', tipo: 'attacco', livello: 0, dmg: 'necrotico' },
  { id: 'veleno-sprizzante', nome: 'Veleno sprizzante', gittata: 10, dado: '1d12', tipo: 'salvezza', salva: 'cos', meta: false, livello: 0, dmg: 'veleno' },
  { id: 'mani-brucianti', nome: 'Mani brucianti', gittata: 15, dado: '3d6', tipo: 'salvezza', salva: 'des', meta: true, area: 5, livello: 1, dmg: 'fuoco' },
  { id: 'colpo-guidato', nome: 'Colpo guidato', gittata: 120, dado: '4d6', tipo: 'attacco', livello: 1, dmg: 'sacro' },
  { id: 'onda-tonante', nome: 'Onda tonante', gittata: 15, dado: '2d8', tipo: 'salvezza', salva: 'cos', meta: true, area: 10, livello: 1, dmg: 'fulmine' },
  { id: 'infliggi-ferite', nome: 'Infliggi ferite', gittata: 5, dado: '3d10', tipo: 'attacco', livello: 1, dmg: 'necrotico' },
  { id: 'raggio-rovente', nome: 'Raggio rovente', gittata: 120, dado: '4d6', tipo: 'attacco', livello: 2, dmg: 'fuoco' },
  { id: 'freccia-acida', nome: 'Freccia acida', gittata: 90, dado: '4d4', tipo: 'attacco', livello: 2, dmg: 'veleno' },
  { id: 'frantumare', nome: 'Frantumare', gittata: 60, dado: '3d8', tipo: 'salvezza', salva: 'cos', meta: true, area: 10, livello: 2, dmg: 'fulmine' },
  { id: 'preghiera-di-guarigione', nome: 'Preghiera di guarigione', gittata: 30, dado: '2d8', tipo: 'cura', mod: true, livello: 2 },
  { id: 'fulmine', nome: 'Fulmine', gittata: 100, dado: '8d6', tipo: 'salvezza', salva: 'des', meta: true, area: 15, livello: 3, dmg: 'fulmine' },
  { id: 'purificazione', nome: 'Purificazione', gittata: 30, dado: '0', tipo: 'rimedio', rimedio: ['veleno', 'bruciatura', 'congelamento', 'paura', 'stordimento'], livello: 2 },
  { id: 'rimuovi-maledizione', nome: 'Rimuovi maledizione', gittata: 5, dado: '0', tipo: 'rimedio', rimedio: ['maledizione'], livello: 3 },
  { id: 'tocco-vampirico', nome: 'Tocco vampirico', gittata: 5, dado: '3d6', tipo: 'attacco', livello: 3, dmg: 'necrotico' },
];

/* ---------- chi può usare cosa ---------- */
const SIMPLE = ['bastone', 'pugnale', 'mazza', 'giavellotto', 'arco-corto', 'balestra', 'ascia-manesca', 'senz-armi', 'dardo'];
const MARTIAL = ['spada-lunga', 'spadone', 'ascia-bipenne', 'stocco', 'spada-corta', 'arco-lungo'];
const ROGUELIKE = [...SIMPLE, 'spada-lunga', 'stocco', 'spada-corta'];
const WEAPON_PROF = { barbaro: [...SIMPLE, ...MARTIAL], guerriero: [...SIMPLE, ...MARTIAL], paladino: [...SIMPLE, ...MARTIAL], ranger: [...SIMPLE, ...MARTIAL], ladro: ROGUELIKE, bardo: ROGUELIKE,
  chierico: SIMPLE, druido: [...SIMPLE, 'scimitarra'], warlock: SIMPLE, monaco: [...SIMPLE, 'spada-corta'], mago: ['pugnale', 'bastone', 'balestra', 'senz-armi'], stregone: ['pugnale', 'bastone', 'balestra', 'senz-armi'] };
/** Caratteristica minima per maneggiare un'arma (le più pesanti chiedono Forza, quelle da tiro Destrezza). */
export const WEAPON_REQ = { spadone: { for: 13 }, 'ascia-bipenne': { for: 13 }, 'spada-lunga': { for: 11 }, mazza: { for: 9 }, 'arco-lungo': { des: 11 }, 'arco-corto': { des: 9 }, balestra: { des: 9 }, stocco: { des: 9 } };

/** Può usare l'arma? ok = no se manca la caratteristica minima. prof = false se la sua classe non è competente (niente bonus di competenza). */
export function weaponCheck(ch, w) {
  const id = w.id || WEAPONS.find(x => x.nome === w.nome)?.id;
  for (const [k, v] of Object.entries(WEAPON_REQ[id] || {})) if ((ch.stats?.[k] ?? 10) < v) return { ok: false, prof: true, why: `Serve ${STAT_NAME[k]} ${v}` };
  const list = WEAPON_PROF[ch.data?.classId]; const prof = !id || !list || list.includes(id);
  return { ok: true, prof, why: prof ? '' : 'Non sei competente: niente bonus di competenza' };
}
/** Può lanciare la magia? Serve una classe che lancia incantesimi, la caratteristica magica a 10 + livello della magia e il livello giusto. */
export function spellCheck(ch, sp) {
  const cls = CLASSES.find(c => c.id === ch.data?.classId);
  if (cls && !cls.cast) return { ok: false, why: `${cls.nome}: non lancia incantesimi` };
  const stat = ch.data?.cast || cls?.cast || 'int'; const L = sp.livello ?? 1;
  if ((ch.stats?.[stat] ?? 10) < 10 + L) return { ok: false, why: `Serve ${STAT_NAME[stat]} ${10 + L}` };
  const lv = levelForSpell(L); if ((ch.level || 1) < lv) return { ok: false, why: `Serve il livello ${lv}` };
  return { ok: true, why: '' };
}

/* ---------- mana ---------- */
/** Mana massimo: chi non lancia incantesimi ne ha 0; gli altri crescono col livello e con la caratteristica magica. */
export function maxMana(ch) {
  const cls = CLASSES.find(c => c.id === ch.data?.classId);
  if (cls ? !cls.cast : !ch.data?.cast) return 0;
  const stat = ch.data?.cast || cls?.cast || 'int'; const lv = ch.level || 1;
  return 6 + 4 * lv + Math.max(0, mod(ch.stats?.[stat] ?? 10)) * lv;
}
/** Mana attuale (chi non l'ha mai usato è al massimo). */
export const manaOf = ch => Math.min(maxMana(ch), ch.data?.mana ?? maxMana(ch));
/** Costo di una magia: 1 per un trucchetto, poi 3, 5, 7... (2 × livello + 1). */
export const spellCost = sp => ((sp.livello ?? 1) <= 0 ? 1 : 2 * sp.livello + 1);

/** Livello del personaggio da cui si può imparare una magia (regole 5e: liv. 1 dal 1°, liv. 2 dal 3°, liv. 3 dal 5°...). */
export const levelForSpell = l => (l <= 0 ? 1 : 2 * l - 1);
export const SCROLL_PRICE = { 1: 60, 2: 120, 3: 250 };
/** Pergamena che insegna una magia (di livello da 1 a maxLevel). */
export function scrollItem(maxLevel = 1) {
  const pool = SPELLS.filter(s => s.livello >= 1 && s.livello <= Math.max(1, maxLevel)); const s = pool[Math.floor(Math.random() * pool.length)];
  return { nome: `Pergamena: ${s.nome}`, desc: `Insegna la magia ${s.nome} (livello ${s.livello}, dal livello ${levelForSpell(s.livello)} del personaggio). Si usa dallo zaino.`, magia: s.id };
}

export const CLASSES = [
  { id: 'barbaro', nome: 'Barbaro', dv: 12, cast: null, ac: m => 10 + m.des + m.cos, armi: ['ascia-bipenne', 'giavellotto'], magie: [] },
  { id: 'bardo', nome: 'Bardo', dv: 8, cast: 'car', ac: m => 11 + m.des, armi: ['stocco', 'pugnale', 'balestra'], magie: ['scherno-crudele', 'parola-guaritrice'] },
  { id: 'chierico', nome: 'Chierico', dv: 8, cast: 'sag', ac: () => 16, armi: ['mazza'], magie: ['sacra-fiamma', 'cura-ferite'] },
  { id: 'druido', nome: 'Druido', dv: 8, cast: 'sag', ac: m => 13 + m.des, armi: ['bastone', 'scimitarra'], magie: ['sferzata-di-spine', 'cura-ferite'] },
  { id: 'guerriero', nome: 'Guerriero', dv: 10, cast: null, ac: () => 16, armi: ['spada-lunga', 'arco-lungo'], magie: [] },
  { id: 'ladro', nome: 'Ladro', dv: 8, cast: null, ac: m => 11 + m.des, armi: ['stocco', 'arco-corto', 'pugnale'], magie: [] },
  { id: 'mago', nome: 'Mago', dv: 6, cast: 'int', ac: m => 10 + m.des, armi: ['bastone', 'pugnale'], magie: ['dardo-di-fuoco', 'dardo-incantato'] },
  { id: 'monaco', nome: 'Monaco', dv: 8, cast: null, ac: m => 10 + m.des + m.sag, armi: ['senz-armi', 'bastone', 'dardo'], magie: [] },
  { id: 'paladino', nome: 'Paladino', dv: 10, cast: 'car', ac: () => 16, armi: ['spada-lunga', 'giavellotto'], magie: [] },
  { id: 'ranger', nome: 'Ranger', dv: 10, cast: 'sag', ac: m => 11 + m.des, armi: ['arco-lungo', 'stocco'], magie: [] },
  { id: 'stregone', nome: 'Stregone', dv: 6, cast: 'car', ac: m => 10 + m.des, armi: ['pugnale', 'balestra'], magie: ['dardo-di-fuoco', 'raggio-di-gelo'] },
  { id: 'warlock', nome: 'Warlock', dv: 8, cast: 'car', ac: m => 11 + m.des, armi: ['pugnale', 'balestra'], magie: ['esplosione-occulta'] },
];

export const crLabel = cr => ({ 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' }[cr] ?? String(cr));

// speed in piedi, atk = bonus per colpire, dado = danni (con bonus), dex = bonus ai tiri salvezza di Destrezza
export const BESTIARY = [
  { id: 'ratto', nome: 'Ratto gigante', cr: 0.125, hp: 7, ac: 12, speed: 30, atk: 4, dado: '1d4+2', gittata: 5, dex: 2, xp: 25, tipo: 'veleno', stato: 'veleno', statoChance: 0.25 },
  { id: 'coboldo', nome: 'Coboldo', cr: 0.125, hp: 5, ac: 12, speed: 30, atk: 4, dado: '1d4+2', gittata: 5, dex: 2, xp: 25 },
  { id: 'goblin', nome: 'Goblin', cr: 0.25, hp: 7, ac: 15, speed: 30, atk: 4, dado: '1d6+2', gittata: 5, dex: 2, xp: 50 },
  { id: 'goblin-arciere', nome: 'Goblin arciere', cr: 0.25, hp: 7, ac: 13, speed: 30, atk: 4, dado: '1d6+2', gittata: 80, dex: 2, xp: 50 },
  { id: 'scheletro', nome: 'Scheletro', cr: 0.25, hp: 13, ac: 13, speed: 30, atk: 4, dado: '1d6+2', gittata: 5, dex: 2, xp: 50, imm: ['veleno', 'necrotico'], vul: ['sacro'], immSt: ['veleno'] },
  { id: 'zombi', nome: 'Zombi', cr: 0.25, hp: 22, ac: 8, speed: 20, atk: 3, dado: '1d6+1', gittata: 5, dex: -2, xp: 50, imm: ['veleno', 'necrotico'], vul: ['sacro'], immSt: ['veleno'] },
  { id: 'lupo', nome: 'Lupo', cr: 0.25, hp: 11, ac: 13, speed: 40, atk: 4, dado: '2d4+2', gittata: 5, dex: 2, xp: 50 },
  { id: 'orco', nome: 'Orco', cr: 0.5, hp: 15, ac: 13, speed: 30, atk: 5, dado: '1d12+3', gittata: 5, dex: 1, xp: 100 },
  { id: 'gnoll', nome: 'Gnoll', cr: 0.5, hp: 22, ac: 15, speed: 30, atk: 4, dado: '1d8+2', gittata: 5, dex: 1, xp: 100 },
  { id: 'ghoul', nome: 'Ghoul', cr: 1, hp: 22, ac: 12, speed: 30, atk: 4, dado: '2d6+2', gittata: 5, dex: 2, xp: 200, imm: ['veleno'], vul: ['sacro'], immSt: ['veleno'], stato: 'stordimento', statoChance: 0.25 },
  { id: 'bugbear', nome: 'Bugbear', cr: 1, hp: 27, ac: 16, speed: 30, atk: 4, dado: '2d8+2', gittata: 5, dex: 2, xp: 200 },
  { id: 'ogre', nome: 'Ogre', cr: 2, hp: 59, ac: 11, speed: 40, atk: 6, dado: '2d8+4', gittata: 5, dex: -1, xp: 450 },
  { id: 'mimic', nome: 'Mimic', cr: 2, hp: 58, ac: 12, speed: 15, atk: 5, dado: '1d8+3', gittata: 5, dex: 1, xp: 450, imm: ['veleno'], immSt: ['veleno'], tipo: 'veleno', stato: 'veleno', statoChance: 0.25 },
  { id: 'segugio', nome: 'Segugio infernale', cr: 3, hp: 45, ac: 14, speed: 50, atk: 5, dado: '2d6+3', gittata: 5, dex: 1, xp: 700, imm: ['fuoco'], vul: ['gelo'], tipo: 'fuoco', stato: 'bruciatura', statoChance: 0.3 },
  { id: 'troll', nome: 'Troll', cr: 5, hp: 84, ac: 15, speed: 30, atk: 7, dado: '2d6+4', gittata: 5, dex: 1, xp: 1800, vul: ['fuoco'] },
];

/** Alberi con frutti: ogni albero dà frutti con un effetto (come una pozione), ne ricrescono dopo ogni dungeon finito. */
export const FRUTTI = {
  melo: { albero: 'Melo dorato', icona: '🍎', n: 3, peso: 35, frutto: { nome: 'Mela dorata', desc: 'Dolce e rigenerante: recupera 1d8+2 punti ferita.', cura: '1d8+2' } },
  bacche: { albero: 'Cespuglio di bacche blu', icona: '🫐', n: 3, peso: 30, frutto: { nome: 'Bacca blu', desc: 'Toglie veleno e gelo.', rimedio: ['veleno', 'congelamento'] } },
  lunare: { albero: 'Albero lunare', icona: '🌙', n: 2, peso: 15, frutto: { nome: 'Frutto lunare', desc: 'Restituisce 8 punti di mana.', mana: 8 } },
  brina: { albero: 'Fico di brina', icona: '🍈', n: 2, peso: 15, frutto: { nome: 'Fico di brina', desc: 'Spegne le fiamme e dà resistenza al fuoco per lo scontro.', rimedio: ['bruciatura'], resTemp: 'fuoco' } },
  vita: { albero: 'Albero della vita', icona: '🌳', n: 1, peso: 5, frutto: { nome: 'Frutto della vita', desc: 'Recupera 3d8 punti ferita e toglie tutti gli stati comuni.', cura: '3d8', rimedio: ['veleno', 'bruciatura', 'congelamento', 'paura', 'stordimento'] } },
};
export const ITEMS = {
  comuni: [
    { nome: 'Pozione di cura', desc: 'Recupera 2d4+2 punti ferita.', cura: '2d4+2' },
    { nome: 'Gemma di quarzo', desc: 'Vale circa 50 monete d\'oro.' },
    { nome: 'Torcia', desc: 'Fa luce per un\'ora.' },
    { nome: 'Pozione di mana', desc: 'Restituisce 10 punti di mana.', mana: 10 },
    { nome: 'Antidoto', desc: 'Toglie l\'avvelenamento.', rimedio: ['veleno'] },
    { nome: 'Unguento lenitivo', desc: 'Spegne le fiamme e cura le ustioni.', rimedio: ['bruciatura'] },
    { nome: 'Brodo caldo', desc: 'Scioglie il gelo dalle ossa.', rimedio: ['congelamento'] },
    { nome: 'Fiala di acido', desc: 'Da lanciare: 2d6 danni (usala come arma personalizzata).' },
    { nome: 'Corda di canapa', desc: '15 metri, resistente.' },
    { nome: 'Pergamena sbiadita', desc: 'Contiene appunti di un avventuriero.' },
  ],
  rari: [
    { nome: 'Pozione di cura maggiore', desc: 'Recupera 4d4+4 punti ferita e toglie veleno e fiamme.', cura: '4d4+4', rimedio: ['veleno', 'bruciatura'] },
    { nome: 'Acqua santa', desc: 'Scaccia maledizioni e paure.', rimedio: ['maledizione', 'paura'] },
    { nome: 'Pozione di resistenza al fuoco', desc: 'Resisti al fuoco per tutto lo scontro.', resTemp: 'fuoco' },
    { nome: 'Pozione di resistenza al gelo', desc: 'Resisti al gelo per tutto lo scontro.', resTemp: 'gelo' },
    { nome: 'Anello della fiamma', desc: 'Resistenza al fuoco finché lo porti.', difesa: { res: ['fuoco'] } },
    { nome: 'Anello del gelo', desc: 'Resistenza al gelo finché lo porti.', difesa: { res: ['gelo'] } },
    { nome: 'Amuleto anti-veleno', desc: 'Resistenza al veleno e niente avvelenamento.', difesa: { res: ['veleno'], stati: ['veleno'] } },
    { nome: 'Talismano sacro', desc: 'Resistenza al necrotico e immunità alle maledizioni.', difesa: { res: ['necrotico'], stati: ['maledizione'] } },
    { nome: 'Anello d\'argento', desc: 'Sembra prezioso, forse è magico.' },
    { nome: 'Pugnale +1', desc: 'Lama sottile, ben bilanciata.' },
    { nome: 'Amuleto runico', desc: 'Pulsa debolmente al tocco.' },
  ],
};

export const TRAPS = [
  { id: 'dardi', nome: 'Dardi avvelenati', desc: 'Piccoli fori nel muro sputano dardi.', detect: 13, disarm: 12, save: 'cos', dc: 12, dado: '2d4', half: true, tipo: 'veleno', stato: 'veleno' },
  { id: 'fossa', nome: 'Fossa nascosta', desc: 'Il pavimento cede su una buca profonda.', detect: 14, disarm: 13, save: 'des', dc: 12, dado: '2d6', half: false },
  { id: 'lama', nome: 'Lama oscillante', desc: 'Una lama esce dal soffitto con un sibilo.', detect: 14, disarm: 14, save: 'des', dc: 13, dado: '2d8', half: true },
  { id: 'pietra', nome: 'Masso rotolante', desc: 'Un masso si stacca e rotola lungo la stanza.', detect: 15, disarm: 14, save: 'des', dc: 14, dado: '3d10', half: true },
  { id: 'rune', nome: 'Rune esplosive', desc: 'Un glifo sul pavimento esplode in fiamme.', detect: 16, disarm: 15, save: 'des', dc: 14, dado: '4d6', half: true, tipo: 'fuoco', stato: 'bruciatura' },
  { id: 'gelo', nome: 'Camera del gelo', desc: 'Una nube di aria gelida esce da una fessura.', detect: 14, disarm: 13, save: 'cos', dc: 13, dado: '3d6', half: true, tipo: 'gelo', stato: 'congelamento' },
  { id: 'maledetta', nome: 'Rune maledette', desc: 'Un segno oscuro si illumina: chi lo tocca porta un\'ombra con sé.', detect: 15, disarm: 15, save: 'sag', dc: 13, dado: '2d6', half: true, tipo: 'necrotico', stato: 'maledizione' },
  { id: 'scintille', nome: 'Piastra a scintille', desc: 'Il pavimento scarica un arco di fulmini.', detect: 14, disarm: 14, save: 'des', dc: 13, dado: '3d6', half: true, tipo: 'fulmine', stato: 'stordimento' },
];

// Più risposte possibili separate da "|"
export const RIDDLES = [
  { titolo: 'Enigma dell\'ombra', prompt: 'Più ce n\'è, meno si vede. Che cos\'è?', answer: 'buio|il buio|le tenebre|tenebre|oscurita|l oscurita' },
  { titolo: 'Enigma del cartografo', prompt: 'Ho città senza case, foreste senza alberi e fiumi senza acqua. Che cosa sono?', answer: 'mappa|una mappa|la mappa|cartina|una cartina' },
  { titolo: 'Enigma dello scavatore', prompt: 'Più ne togli, più diventa grande. Che cos\'è?', answer: 'buco|un buco|il buco|fossa|una fossa' },
  { titolo: 'Enigma del viandante', prompt: 'Sale e scende senza muoversi mai. Che cos\'è?', answer: 'scala|una scala|la scala|scale|le scale|scalinata|una scalinata' },
  { titolo: 'Enigma della fiamma', prompt: 'Vivo se mi nutri, muoio se mi bagni. Che cosa sono?', answer: 'fuoco|il fuoco|fiamma|la fiamma|un fuoco' },
];

export const SKILL_CHECKS = [
  { titolo: 'Serratura arrugginita', prompt: 'Una serratura complessa blocca il passaggio. Serve mano ferma.', stat: 'des', dc: 13 },
  { titolo: 'Porta sbarrata', prompt: 'Una trave massiccia blocca la porta dall\'altra parte.', stat: 'for', dc: 14 },
  { titolo: 'Rune sigillate', prompt: 'Simboli incisi sulla porta vanno decifrati nel giusto ordine.', stat: 'int', dc: 13 },
  { titolo: 'Meccanismo antico', prompt: 'Ingranaggi e leve vanno azionati in sequenza.', stat: 'int', dc: 14 },
  { titolo: 'Guardiano spettrale', prompt: 'Uno spettro lascerà passare solo chi sa convincerlo.', stat: 'car', dc: 13 },
];

export const ROOM_NOUNS = [['Cripta', 'f'], ['Cantina', 'f'], ['Armeria', 'f'], ['Cappella', 'f'], ['Fucina', 'f'], ['Cisterna', 'f'], ['Galleria', 'f'], ['Prigione', 'f'], ['Sala dei pilastri', 'f'], ['Ossario', 'm'], ['Santuario', 'm'], ['Corridoio', 'm']];
export const ROOM_ADJ = [['antica', 'antico'], ['umida', 'umido'], ['silenziosa', 'silenzioso'], ['dimenticata', 'dimenticato'], ['profonda', 'profondo'], ['buia', 'buio'], ['gelida', 'gelido']];
