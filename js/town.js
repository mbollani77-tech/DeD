// Gli abitanti dei paesi: l'oste fa riposare, il mercante compra e vende, gli altri raccontano voci e danno incarichi.
import { update, remove, say, setCampaignState } from './db.js';
import { ask, esc, toast } from './ui.js';
import { WEAPONS, SPELLS, CLASSES, SCROLL_PRICE, WEAPON_REQ, STAT_NAME, levelForSpell, weaponCheck, spellCheck, maxMana, manaOf, mod } from './rules.js';
import { pick } from './dice.js';
import { rollD20M } from './rolls.js';
import { makeCandidate, hireCompanion, hirePrice, companionsOf, MAX_COMPANIONS } from './companions.js';

const SHOP_ITEMS = [
  { nome: 'Pozione di cura', desc: 'Recupera 2d4+2 punti ferita.', cura: '2d4+2', prezzo: 25 },
  { nome: 'Pozione di cura maggiore', desc: 'Recupera 4d4+4 punti ferita.', cura: '4d4+4', prezzo: 90 },
  { nome: 'Torcia', desc: 'Fa luce per un\'ora.', prezzo: 1 },
  { nome: 'Corda di canapa', desc: '15 metri, resistente.', prezzo: 2 },
  { nome: 'Fiala di acido', desc: 'Da lanciare: 2d6 danni (usala come arma personalizzata).', prezzo: 25 },
  { nome: 'Razioni da viaggio', desc: 'Cibo per un giorno di cammino.', prezzo: 1 },
];
const WEAPON_PRICE = { pugnale: 2, 'spada-corta': 10, 'ascia-manesca': 5, mazza: 5, bastone: 1, stocco: 25, 'spada-lunga': 15, spadone: 50, 'ascia-bipenne': 30, giavellotto: 5, 'arco-corto': 25, 'arco-lungo': 50, balestra: 25 };
const SELL_KNOWN = { 'Pozione di cura': 12, 'Pozione di cura maggiore': 45, 'Gemma di quarzo': 50, 'Anello d\'argento': 40, 'Pugnale +1': 60, 'Amuleto runico': 80 };

const oroOf = ch => ch.data.oro || 0;
const sellPrice = it => (it.magia ? Math.round((SCROLL_PRICE[SPELLS.find(s => s.id === it.magia)?.livello] || 60) / 2) : null) ?? SELL_KNOWN[it.nome] ?? Math.max(1, Math.round(((SHOP_ITEMS.find(s => s.nome === it.nome)?.prezzo) || 2) / 2));
const give = (store, ch, patch) => update(store, 'characters', ch.id, patch);

export async function talkTo(store, ch, npc) {
  const role = npc.data.role;
  if (role === 'locanda') return inn(store, ch, npc);
  if (role === 'negozio') return shop(store, ch, npc);
  if (role === 'prigioniero' || role === 'viandante') return recruit(store, ch, npc);
  return rumors(store, ch, npc);
}

/* ---------- locanda ---------- */
async function inn(store, ch, npc) {
  const cost = Math.max(5, (ch.level || 1) * 5);
  const a = await ask({ title: npc.name, ok: 'Avanti', intro: `Hai ${oroOf(ch)} monete d'oro.`, fields: [{ name: 'az', label: 'Cosa desideri?', type: 'select', value: 'riposo', options: [{ v: 'riposo', l: `Passare la notte (${cost} mo): recuperi punti ferita e mana` }, { v: 'assumi', l: 'Assumere un avventuriero come compagno' }] }] });
  if (!a) return;
  if (a.az === 'assumi') return hireAtInn(store, ch, npc);
  if (ch.hp >= ch.max_hp && manaOf(ch) >= maxMana(ch)) return toast(`${npc.name}: «Hai un bell'aspetto! Torna quando sarai stanco.»`);
  const v = await ask({ title: npc.name, ok: `Riposa (${cost} mo)`, cancel: 'No, grazie', intro: `«Un letto caldo e una zuppa: ${cost} monete d'oro per la notte.» Recuperi tutti i punti ferita e il mana. Hai ${oroOf(ch)} monete d'oro.`, fields: [] });
  if (!v) return;
  if (oroOf(ch) < cost) throw new Error('Non hai abbastanza monete d\'oro.');
  await give(store, ch, { hp: ch.max_hp, data: { ...ch.data, oro: oroOf(ch) - cost, mana: maxMana(ch) } });
  say(store, ch.name, 'event', `${ch.name} passa la notte alla locanda (${cost} mo) e si risveglia in piena forma.`);
}

/** Alla locanda c'è sempre qualche avventuriero in cerca di ingaggio, a pagamento (40 mo per livello, una volta sola). */
async function hireAtInn(store, ch, npc) {
  if (companionsOf(store, ch).length >= MAX_COMPANIONS) throw new Error(`Hai già ${MAX_COMPANIONS} compagni: congedane uno dalla scheda per farne entrare un altro.`);
  let cands = npc.data.candidati; const lvl = Math.max(1, Math.round(store.characters.filter(c => !c.data?.companion).reduce((x, c) => x + c.level, 0) / Math.max(1, store.characters.filter(c => !c.data?.companion).length)));
  if (!cands?.length) { cands = [0, 1, 2].map(i => makeCandidate(Math.max(1, lvl + (i - 1)))); await update(store, 'entities', npc.id, { data: { ...npc.data, candidati: cands } }); }
  const label = c => `${c.name} — ${CLASSES.find(k => k.id === c.classId).nome} di livello ${c.level} — ${hirePrice(c)} mo`;
  const v = await ask({ title: 'Avventurieri in cerca di ingaggio', ok: 'Assumi', intro: `Un compagno combatte al tuo fianco da solo, ti segue ovunque e divide con te esperienza e bottino (l'oro va a te). Hai ${oroOf(ch)} monete d'oro.`,
    fields: [{ name: 'i', label: 'Chi assumi?', type: 'select', value: '0', options: cands.map((c, i) => ({ v: String(i), l: label(c) })) }] });
  if (!v) return; const c = cands[+v.i]; const price = hirePrice(c);
  if (oroOf(ch) < price) throw new Error('Non hai abbastanza monete d\'oro.');
  await give(store, ch, { data: { ...ch.data, oro: oroOf(ch) - price } });
  await update(store, 'entities', npc.id, { data: { ...npc.data, candidati: cands.filter((_, k) => k !== +v.i) } });
  await hireCompanion(store, store.characters.find(x => x.id === ch.id), c);
}

/** Prigionieri e viandanti: li si convince con un tiro di Carisma o di Intelligenza. */
async function recruit(store, ch, npc) {
  const cand = npc.data.cand; const cls = CLASSES.find(c => c.id === cand.classId);
  if (companionsOf(store, ch).length >= MAX_COMPANIONS) throw new Error(`Hai già ${MAX_COMPANIONS} compagni: congedane uno dalla scheda per farne entrare un altro.`);
  const dc = (npc.data.dc || 12) + 2 * (npc.data.fails || 0);
  const story = npc.data.role === 'prigioniero' ? `«${npc.name} è incatenato, ma ha l'aria di saper combattere.» Se lo convinci, ti seguirà.` : `«Un viaggiatore solitario cerca compagnia sulla strada.» Se lo convinci, ti seguirà.`;
  const v = await ask({ title: `${npc.name}, ${cls.nome} di livello ${cand.level}`, ok: 'Prova a convincerlo', cancel: 'Lascia stare',
    intro: `${story}<br>Difficoltà della prova: <b>${dc}</b>${npc.data.fails ? ` (ha già rifiutato ${npc.data.fails} ${npc.data.fails === 1 ? 'volta' : 'volte'})` : ''}.`,
    fields: [{ name: 'stat', label: 'Come lo convinci?', type: 'select', value: mod(ch.stats.car) >= mod(ch.stats.int) ? 'car' : 'int', options: [{ v: 'car', l: `Carisma — persuaderlo (${fmt(mod(ch.stats.car))})` }, { v: 'int', l: `Intelligenza — con la logica e le giuste parole (${fmt(mod(ch.stats.int))})` }] }] });
  if (!v) return;
  const bonus = mod(ch.stats[v.stat]); const r = await rollD20M(bonus, null, `${ch.name}: prova di ${v.stat === 'car' ? 'Carisma' : 'Intelligenza'} per convincere ${npc.name} (CD ${dc})`);
  const ok = r.crit || (!r.fumble && r.total >= dc);
  if (ok) { await remove(store, 'entities', npc.id); await hireCompanion(store, store.characters.find(x => x.id === ch.id), cand); return; }
  const fails = (npc.data.fails || 0) + 1;
  if (r.fumble || fails >= 3) { await remove(store, 'entities', npc.id); say(store, ch.name, 'event', `${npc.name} perde la pazienza e se ne va${r.fumble ? ': hai detto la cosa sbagliata' : ''} (${r.text} contro CD ${dc}).`); return; }
  await update(store, 'entities', npc.id, { data: { ...npc.data, fails } });
  say(store, ch.name, 'event', `${npc.name} non è convinto (${r.text} contro CD ${dc}). Puoi riprovare, ma sarà più difficile.`);
}
const fmt = n => (n >= 0 ? '+' : '') + n;

/* ---------- negozio ---------- */
async function shop(store, ch, npc) {
  const a = await ask({ title: npc.name, ok: 'Avanti', intro: `«Dai un'occhiata alla merce!» Hai ${oroOf(ch)} monete d'oro.`, fields: [{ name: 'az', label: 'Cosa vuoi fare?', type: 'select', value: 'compra', options: [{ v: 'compra', l: 'Comprare' }, { v: 'vendi', l: 'Vendere' }] }] });
  if (!a) return;
  if (a.az === 'compra') {
    const stock = [...SHOP_ITEMS.map(i => ({ k: 'o:' + i.nome, l: `${i.nome} — ${i.prezzo} mo`, prezzo: i.prezzo, item: i })),
      ...SPELLS.filter(s => s.livello >= 1 && s.livello <= 3).map(s => ({ k: 's:' + s.id, l: `Pergamena: ${s.nome} (liv. ${s.livello}${spellCheck(ch, s).ok ? '' : ', ' + spellCheck(ch, s).why.toLowerCase()}) — ${SCROLL_PRICE[s.livello]} mo`, prezzo: SCROLL_PRICE[s.livello], item: { nome: `Pergamena: ${s.nome}`, desc: `Insegna la magia ${s.nome} (livello ${s.livello}, dal livello ${levelForSpell(s.livello)} del personaggio). Si usa dallo zaino.`, magia: s.id, prezzo: SCROLL_PRICE[s.livello] } })),
      ...WEAPONS.filter(w => WEAPON_PRICE[w.id] && w.id !== 'senz-armi').map(w => ({ k: 'w:' + w.id, l: `${w.nome} (${w.dado}${Object.entries(WEAPON_REQ[w.id] || {}).map(([k, v]) => `, ${STAT_NAME[k]} ${v}`).join('')}${weaponCheck(ch, w).prof ? '' : ', non sei competente'}) — ${WEAPON_PRICE[w.id]} mo`, prezzo: WEAPON_PRICE[w.id], arma: w }))];
    const v = await ask({ title: 'Compra', ok: 'Compra', intro: `Hai ${oroOf(ch)} monete d'oro.`, fields: [{ name: 'k', label: 'Cosa compri?', type: 'select', value: stock[0].k, options: stock.map(s => ({ v: s.k, l: s.l })) }] });
    if (!v) return; const s = stock.find(x => x.k === v.k);
    if (oroOf(ch) < s.prezzo) throw new Error('Non hai abbastanza monete d\'oro.');
    const data = { ...ch.data, oro: oroOf(ch) - s.prezzo };
    if (s.item) { const { prezzo, ...it } = s.item; data.oggetti = [...(ch.data.oggetti || []), it]; } else data.armi = [...(ch.data.armi || []), { ...s.arma }];
    await give(store, ch, { data });
    return say(store, ch.name, 'event', `${ch.name} compra ${s.item?.nome || s.arma.nome} per ${s.prezzo} mo.`);
  }
  const items = ch.data.oggetti || [];
  if (!items.length) return toast(`${npc.name}: «Non hai niente da vendermi.»`);
  const v = await ask({ title: 'Vendi', ok: 'Vendi', intro: `Il mercante paga la metà del valore. Hai ${oroOf(ch)} monete d'oro.`, fields: [{ name: 'i', label: 'Cosa vendi?', type: 'select', value: '0', options: items.map((it, i) => ({ v: String(i), l: `${it.nome} — ${sellPrice(it)} mo` })) }] });
  if (!v) return; const it = items[+v.i]; const p = sellPrice(it);
  await give(store, ch, { data: { ...ch.data, oro: oroOf(ch) + p, oggetti: items.filter((_, i) => i !== +v.i) } });
  say(store, ch.name, 'event', `${ch.name} vende ${it.nome} per ${p} mo.`);
}

/* ---------- voci e incarichi ---------- */
const FLAVOR = ['«Di notte, dal bosco, si sentono ululati che non sembrano di lupo.»', '«Il vecchio ponte è sicuro, ma non allontanarti dalla strada.»', '«Se hai monete, il mercante ha pozioni a buon prezzo.»', '«Chi dorme alla locanda riparte come nuovo.»', '«Le paludi sono piene di cose che è meglio non incontrare.»'];

async function rumors(store, ch, npc) {
  const st = store.campaign.state || {}; const quests = st.worldQuests || [];
  const world = store.rooms.find(r => r.id === ch.room_id)?.meta?.town ? store.rooms.find(r => r.meta?.world) : null;
  const dungeons = world ? store.entities.filter(e => e.room_id === world.id && e.kind === 'door' && e.data.place === 'dungeon') : [];
  const free = dungeons.filter(d => !quests.some(q => q.place_id === d.id)).sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0));
  const active = quests.filter(q => q.stato === 'attiva');
  const list = quests.length ? `<ul>${quests.map(q => `<li>${q.stato === 'fatta' ? '✔ ' : ''}Raggiungi <b>${esc(q.nome)}</b> — ${q.premio} mo${q.stato === 'fatta' ? ' (compiuto)' : ''}</li>`).join('')}</ul>` : '';
  const next = free[0];
  if (!next) {
    await ask({ title: npc.name, ok: '', cancel: 'Grazie', intro: `${pick(FLAVOR)}<br><br>${active.length ? 'Hai ancora incarichi da portare a termine:' : 'Per ora non ho altri incarichi per te.'}${list}` });
    return;
  }
  const premio = ((next.data.order ?? 0) + 1) * 25 * Math.max(1, ch.level || 1);
  const v = await ask({ title: npc.name, ok: 'Accetto l\'incarico', cancel: 'Magari un\'altra volta',
    intro: `«C'è un posto che chiamano <b>${esc(next.name)}</b>. Pochi ci vanno e tornano. Se riesci a raggiungerlo ti darò <b>${premio} monete d'oro</b>.»${list ? `<br><br>I tuoi incarichi:${list}` : ''}`, fields: [] });
  if (!v) return;
  if (next.hidden) await update(store, 'entities', next.id, { hidden: false });
  await setCampaignState(store, { worldQuests: [...quests, { id: `q${Date.now().toString(36)}`, place_id: next.id, nome: next.name, premio, stato: 'attiva' }] });
  say(store, ch.name, 'event', `${ch.name} accetta un incarico: raggiungere ${next.name} (${premio} mo). Il luogo compare sulla mappa del mondo.`);
}

/** Per la scheda del giocatore: elenco degli incarichi. */
export const questsHtml = store => {
  const q = store.campaign.state?.worldQuests || []; if (!q.length) return '';
  return `<div class="card"><strong>Incarichi</strong><ul>${q.map(x => `<li>${x.stato === 'fatta' ? '✔ ' : ''}Raggiungi ${esc(x.nome)} — ${x.premio} mo${x.stato === 'fatta' ? ' (compiuto)' : ''}</li>`).join('')}</ul></div>`;
};

/** Usa una pergamena dallo zaino: il personaggio impara la magia (se la sua classe lancia incantesimi e ha il livello giusto). */
export async function learnSpell(store, ch, i) {
  const items = ch.data.oggetti || []; const it = items[i]; if (!it?.magia) throw new Error('Questo oggetto non insegna nessuna magia.');
  const sp = SPELLS.find(s => s.id === it.magia); if (!sp) throw new Error('Magia sconosciuta.');
  const sc = spellCheck(ch, sp); if (!sc.ok) throw new Error(`${sp.nome}: ${sc.why}. Puoi vendere la pergamena o tenerla per dopo.`);
  if ((ch.data.magie || []).some(m => m.id === sp.id || m.nome === sp.nome)) throw new Error('Conosci già questa magia.');
  await update(store, 'characters', ch.id, { data: { ...ch.data, magie: [...(ch.data.magie || []), { ...sp }], oggetti: items.filter((_, k) => k !== i) } });
  say(store, ch.name, 'event', `${ch.name} studia la pergamena e impara una magia nuova: ${sp.nome}!`);
}
