// Generatori casuali: stanze, mostri, tesori, trappole, quest.
import { randInt, pick, shuffle, rollDie } from './dice.js';
import { BESTIARY, TRAPS, ITEMS, RIDDLES, SKILL_CHECKS, ROOM_NOUNS, ROOM_ADJ } from './rules.js';
import { key, dist, neighbors, reachable, inBounds } from './hex.js';
import { THEMES, THEME_PROPS, PROPS, propBlocks } from './props.js';
export { randInt, pick };

export const roomName = () => { const [n, g] = pick(ROOM_NOUNS); const a = pick(ROOM_ADJ); return `${n} ${a[g === 'f' ? 0 : 1]}`; };
export const crMax = lvl => (lvl <= 1 ? 0.25 : lvl === 2 ? 0.5 : lvl <= 4 ? 1 : lvl <= 6 ? 2 : lvl <= 8 ? 3 : 5);

export function itemsToText(items = []) { return items.map(i => i.desc ? `${i.nome} | ${i.desc}` : i.nome).join('\n'); }
export function parseItems(text = '') {
  return String(text).split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [nome, ...rest] = l.split('|'); const desc = rest.join('|').trim();
    const cura = (desc.match(/(\d+d\d+(?:\s*\+\s*\d+)?)/) || [])[1];
    const it = { nome: nome.trim() }; if (desc) it.desc = desc;
    if (cura && /cur|recuper|punti ferita/i.test(desc + nome)) it.cura = cura.replace(/\s/g, '');
    return it;
  });
}

export function monsterFromPreset(p, nome) {
  return { kind: 'monster', name: nome || p.nome, data: { preset: p.id, cr: p.cr, hp: p.hp, maxHp: p.hp, ac: p.ac, speed: p.speed, atk: p.atk, dado: p.dado, gittata: p.gittata, dex: p.dex, xp: p.xp, dead: false } };
}
export function randomMonster(level = 1) {
  const max = crMax(level);
  const pool = BESTIARY.filter(m => m.cr <= max && m.cr >= max / 4);
  return monsterFromPreset(pick(pool.length ? pool : BESTIARY.filter(m => m.cr <= max)));
}

export function randomTreasure(level = 1) {
  const oro = (rollDie(6) + rollDie(6)) * 5 * Math.max(1, level);
  const oggetti = []; const r = rollDie(100);
  if (r > 35 && r <= 75) oggetti.push(pick(ITEMS.comuni));
  else if (r > 75 && r <= 95) oggetti.push(ITEMS.comuni[0], pick(ITEMS.comuni));
  else if (r > 95) oggetti.push(pick(ITEMS.rari));
  return { kind: 'treasure', name: pick(['Forziere di legno', 'Sacca abbandonata', 'Baule rinforzato', 'Scrigno polveroso', 'Cassa ammaccata']), data: { oro, oggetti, looted: false } };
}

const scaleDado = (d, m) => d.replace(/^(\d+)d(\d+)/, (_, n, s) => `${n * m}d${s}`);
export function trapFromPreset(p, level = 1) {
  return { kind: 'trap', name: p.nome, hidden: true, data: { desc: p.desc, detect: p.detect + Math.floor(level / 3), disarm: p.disarm + Math.floor(level / 3), save: p.save, dc: p.dc + Math.floor(level / 3), dado: scaleDado(p.dado, 1 + Math.floor(level / 5)), half: p.half, armed: true, reusable: false } };
}
export const randomTrap = (level = 1) => trapFromPreset(pick(TRAPS), level);

export function randomQuest(level = 1) {
  const t = rollDie(3);
  if (t === 1) { const r = pick(RIDDLES); return { title: r.titolo, kind: 'riddle', data: { prompt: r.prompt, answer: r.answer } }; }
  if (t === 2) { const c = pick(SKILL_CHECKS); return { title: c.titolo, kind: 'check', data: { prompt: c.prompt, stat: c.stat, dc: c.dc + Math.floor(level / 3) } }; }
  return { title: 'Porta con chiave', kind: 'key', data: { prompt: 'Una pesante serratura di ferro. La chiave deve essere nascosta qui intorno.', key_item: 'Chiave di ferro', consume: true }, needsKey: true };
}


export const pickTheme = () => pick(['cripta', 'cripta', 'caverna', 'tempio', 'foresta', 'ghiaccio']);
export const pickLuce = theme => (theme === 'foresta' || theme === 'tempio' ? pick(['piena', 'piena', 'fioca']) : pick(['fioca', 'fioca', 'buia', 'piena']));

/** Arredi coerenti col tema: torce sui muri e mobili sul pavimento, senza bloccare i passaggi. */
export function randomProps(room, theme, { start = { col: 1, row: 1 }, exitFront = null, taken = new Set(), count = null } = {}) {
  const { cols, rows, cells } = room; const props = []; const used = new Set(taken);
  const isFloor = (c, r) => c > 0 && r > 0 && c < cols - 1 && r < rows - 1 && cells[key(c, r)] !== 'w';
  // torce e luci sui muri
  const torches = theme === 'foresta' ? 0 : theme === 'caverna' ? randInt(0, 1) : randInt(2, 5);
  if (torches) {
    const wallSpots = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (cells[key(c, r)] === 'w' && neighbors(c, r).some(n => inBounds(room, n) && isFloor(n.col, n.row))) wallSpots.push({ c, r });
    shuffle(wallSpots).filter((w, i, arr) => arr.slice(0, i).every(o => dist({ col: o.c, row: o.r }, { col: w.c, row: w.r }) > 3)).slice(0, torches).forEach(w => { props.push({ t: 'torcia', c: w.c, r: w.r }); used.add(key(w.c, w.r)); });
  }
  // arredi
  const floors = []; for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) if (isFloor(c, r)) floors.push({ col: c, row: r });
  const cand = shuffle(floors.filter(h => dist(h, start) > 1 && !(exitFront && dist(h, exitFront) <= 1) && cells[key(h.col, h.row)] !== 'a'));
  const want = count ?? randInt(4, 8); const list = THEME_PROPS[theme] || THEME_PROPS.cripta; const need = new Set([...floors.filter(h => true)].map(h => key(h.col, h.row)));
  for (const h of cand) {
    if (props.filter(p => p.t !== 'torcia').length >= want) break;
    const k = key(h.col, h.row); if (used.has(k)) continue;
    const t = pick(list); const trial = [...props, { t, c: h.col, r: h.row }];
    if (PROPS[t].blocca) {
      const blocked = propBlocks({ meta: { props: trial } });
      const reach = reachable(room, start, 999, blocked);
      const fine = floors.filter(f => !blocked.has(key(f.col, f.row)) && cells[key(f.col, f.row)] !== 'w');
      const open = fine.filter(f => reach.has(key(f.col, f.row)) || (f.col === start.col && f.row === start.row)).length;
      if (open < fine.length * 0.92 || (exitFront && !reach.has(key(exitFront.col, exitFront.row)))) continue;
    }
    props.push({ t, c: h.col, r: h.row }); used.add(k);
  }
  return props;
}

/** Genera una stanza completa. Le coordinate delle porte sono in `meta`. */
export function generateRoom({ cols = randInt(12, 17), rows = randInt(9, 12), level = 1, party = 3, difficulty = 1, hasEntrance = true, hasExit = true, lockedChance = 0.6 } = {}) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const cells = {};
    for (let c = 0; c < cols; c++) { cells[key(c, 0)] = 'w'; cells[key(c, rows - 1)] = 'w'; }
    for (let r = 0; r < rows; r++) { cells[key(0, r)] = 'w'; cells[key(cols - 1, r)] = 'w'; }
    const midIn = Math.floor(rows / 2), midOut = randInt(2, rows - 3);
    const start = { col: 1, row: midIn }, entrance = { col: 0, row: midIn };
    const exit = { col: cols - 1, row: midOut }, exitFront = { col: cols - 2, row: midOut };
    if (hasEntrance) delete cells[key(0, midIn)];
    if (hasExit) delete cells[key(cols - 1, midOut)];
    // pilastri
    for (let i = 0, n = randInt(2, 5); i < n; i++) {
      const c = randInt(3, cols - 4), r = randInt(2, rows - 3); cells[key(c, r)] = 'w';
      if (rollDie(2) === 1) { const nb = pick(neighbors(c, r)); if (nb.col > 1 && nb.col < cols - 2 && nb.row > 1 && nb.row < rows - 2) cells[key(nb.col, nb.row)] = 'w'; }
    }
    // pozze e macerie
    for (let i = 0, n = randInt(1, 2); i < n; i++) {
      const t = pick(['d', 'a', 'd']); let p = { col: randInt(3, cols - 4), row: randInt(2, rows - 3) };
      for (let s = 0, len = randInt(5, 12); s < len; s++) {
        if (cells[key(p.col, p.row)] !== 'w') cells[key(p.col, p.row)] = t;
        const nb = pick(neighbors(p.col, p.row));
        if (nb.col > 0 && nb.col < cols - 1 && nb.row > 0 && nb.row < rows - 1) p = nb;
      }
    }
    // zone d'ingresso e uscita libere
    [start, ...neighbors(start.col, start.row), exitFront].forEach(h => { if (h.col > 0 && h.col < cols - 1 && h.row > 0 && h.row < rows - 1) delete cells[key(h.col, h.row)]; });
    const room = { cols, rows, cells };
    const reach = reachable(room, start, 999);
    const open = []; for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) if (cells[key(c, r)] !== 'w') open.push({ col: c, row: r });
    const ok = open.filter(h => reach.has(key(h.col, h.row)) || (h.col === start.col && h.row === start.row)).length;
    if (ok < open.length * 0.9 || (hasExit && !reach.has(key(exitFront.col, exitFront.row)))) continue;

    const theme = pickTheme(); const luce = pickLuce(theme);
    const props = randomProps(room, theme, { start, exitFront: hasExit ? exitFront : null });
    const propKeys = new Set(props.map(p => key(p.c, p.r)));
    const free = shuffle(open.filter(h => dist(h, start) > 2 && dist(h, exitFront) > 1 && reach.has(key(h.col, h.row)) && !propKeys.has(key(h.col, h.row))));
    const entities = [];
    const put = (e, hidden = false) => { const h = free.pop(); if (h) entities.push({ hidden, ...e, col: h.col, row: h.row }); };

    // mostri
    const n = Math.max(1, Math.min(7, randInt(2, 3) + (party >= 4 ? 1 : 0) + (difficulty - 1)));
    const types = []; const m1 = randomMonster(level); types.push(m1);
    const counts = {};
    for (let i = 0; i < n; i++) { const m = (i && rollDie(10) > 7) ? randomMonster(level) : m1; counts[m.name] = (counts[m.name] || 0) + 1; types.push({ ...m, _n: counts[m.name] }); }
    types.shift();
    const totals = {}; types.forEach(m => (totals[m.name] = (totals[m.name] || 0) + 1));
    types.forEach(m => {
      const base = { ...m, name: totals[m.name] > 1 ? `${m.name} ${m._n}` : m.name, data: { ...m.data } }; delete base._n;
      if (rollDie(10) <= 4) base.data.loot = { oro: randInt(1, 8) * Math.max(1, level), oggetti: [] };
      put(base, rollDie(100) <= 15);
    });
    // tesori e trappole
    for (let i = 0, k = rollDie(3) === 1 ? 2 : 1; i < k; i++) put(randomTreasure(level), rollDie(4) === 1);
    for (let i = 0, k = randInt(0, 2); i < k; i++) put(randomTrap(level), true);

    // porte
    let quest = null;
    if (hasEntrance) entities.push({ kind: 'door', name: 'Porta d\'ingresso', col: entrance.col, row: entrance.row, hidden: false, _role: 'entrance', data: { locked: false } });
    if (hasExit) {
      const locked = Math.random() < lockedChance;
      if (locked) { quest = randomQuest(level); if (quest.needsKey) put({ kind: 'treasure', name: 'Cassettina con chiave', data: { oro: 0, oggetti: [{ nome: 'Chiave di ferro', desc: 'Una chiave pesante, dall\'aria antica.' }], looted: false } }, rollDie(2) === 1); }
      entities.push({ kind: 'door', name: locked ? 'Porta sigillata' : 'Porta d\'uscita', col: exit.col, row: exit.row, hidden: false, _role: 'exit', data: { locked } });
    }
    return { name: roomName(), cols, rows, cells, meta: { start, entrance, exit, exitFront, theme, luce, props }, entities, quest };
  }
  throw new Error('Generazione stanza fallita');
}
